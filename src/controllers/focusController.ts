import { Response, Request } from "express";
import { HttpStatusCode } from "axios";
import { Logger } from "../utils/Logger";
import { PreprocessingProvider } from "../providers/preprocessing.provider";
import { FhirEpiProvider } from "../providers/fhirEpi.provider";
import { FhirIpsProvider } from "../providers/fhirIps.provider";
import { LensesProvider } from "../providers/lenses.provider";
import { PersonaVectorProvider } from "../providers/personaVector.provider";
import { Liquid } from "liquidjs";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { applyLenses, LensExecutionConfig } from "@gravitate-health/lens-execution-environment";
import { getLeeLoggingConfig } from "../utils/leeLogging";
import { getFhirFormatFromContentType, parseFhirResource } from "../utils/fhirParser";

const FHIR_IPS_URL = process.env.FHIR_IPS_URL as string;
const FHIR_EPI_URL = process.env.FHIR_EPI_URL as string;
const PERSONA_VECTOR_URL = process.env.PERSONA_VECTOR_URL as string;
const LENS_EXECUTION_TIMEOUT = parseInt(process.env.LENS_EXECUTION_TIMEOUT || "1000", 10);

let preprocessingProvider = new PreprocessingProvider("")
let lensesProvider = new LensesProvider("")
let fhirEpiProvider = new FhirEpiProvider(FHIR_EPI_URL)
let fhirIpsProvider = new FhirIpsProvider(FHIR_IPS_URL)
let personaVectorProvider = new PersonaVectorProvider(PERSONA_VECTOR_URL)

/**
 * Get template file path from configured template directory
 * Uses TEMPLATE_DIR environment variable at runtime, defaults to build/templates
 * Checked at runtime (not module load time) to support testing
 */
const getTemplatePath = (templateName: string): string => {
    const templateDir = process.env.TEMPLATE_DIR || join(process.cwd(), 'build', 'templates');
    return join(templateDir, templateName);
}

/**
 * Parse FHIR resource from request body based on Content-Type header
 * Supports JSON, XML, and RDF formats
 * Returns Promise for RDF formats, synchronous value for JSON/XML
 */
const parseRequestResource = async (req: Request, data: any, resourceName: string): Promise<any> => {
    // Check if resource was sent via multipart/form-data
    const files = (req as any).files;
    if (files && files[resourceName] && files[resourceName][0]) {
        const file = files[resourceName][0];
        const content = file.buffer.toString('utf-8');
        const format = getFhirFormatFromContentType(file.mimetype);
        
        Logger.logDebug("focusController.ts", "parseRequestResource", 
            `Parsing ${resourceName} from multipart (mimetype: ${file.mimetype}, format: ${format})`);
        
        try {
            const result = parseFhirResource(content, format);
            // Handle both sync (JSON/XML) and async (RDF) results
            return await Promise.resolve(result);
        } catch (error: any) {
            Logger.logError("focusController.ts", "parseRequestResource", 
                `Failed to parse ${resourceName} from multipart: ${error.message}`);
            throw new Error(`Invalid ${format.toUpperCase()} format for ${resourceName}`);
        }
    }
    
    // Fallback to original logic for JSON body
    const contentType = req.get('Content-Type');
    const format = getFhirFormatFromContentType(contentType);
    
    Logger.logDebug("focusController.ts", "parseRequestResource", 
        `Parsing ${resourceName} with Content-Type: ${contentType} (format: ${format})`);
    
    // If data is already an object (parsed by Express middleware), return as-is
    if (typeof data === 'object' && format === 'json') {
        return data;
    }
    
    // If data is a string, parse based on format
    if (typeof data === 'string') {
        try {
            const result = parseFhirResource(data, format);
            // Handle both sync (JSON/XML) and async (RDF) results
            return await Promise.resolve(result);
        } catch (error: any) {
            Logger.logError("focusController.ts", "parseRequestResource", 
                `Failed to parse ${resourceName}: ${error.message}`);
            throw new Error(`Invalid ${format.toUpperCase()} format for ${resourceName}`);
        }
    }
    
    // Data is already parsed, return as-is
    return data;
}

const getAllPreprocessorNames = async (): Promise<string[]> => {
    // Get preprocessors
    let preprocessors = await preprocessingProvider.queryPreprocessingServices()
    return preprocessors
}

export const focus = async (req: Request, res: Response) => {
    console.log("_________________________________________")
    Logger.logInfo("focusController.ts", "focus", "\n\n\n_____________ POST /focusing/focus ____________");
    console.log("_________________________________________")

    // Get ePI (from params or body)
    const epi = await getEpi(req, res);
    if (!epi) return;

    // Get IPS (from query or body)
    const ips = await getIps(req, res);
    if (!ips) return;

    // Get and parse lenses and preprocessors
    const result = await getLensesAndPreprocessors(req, res);
    if (!result) return;
    
    const { preprocessors, parsedLenses } = result;

    // Get persona vector (optional)
    const pv = await getPersonaVector(req);

    focusProccess(req, res, epi, ips, pv, preprocessors, parsedLenses);
}

const getPersonaVector = async (req: Request): Promise<any | null> => {
    // If personaVectorId is provided in query, fetch from FHIR server
    if (req.query.personaVectorId && req.query.personaVectorId !== "undefined") {
        const personaVectorId = req.query.personaVectorId as string;
        try {
            let pvResponse = await personaVectorProvider.getPersonaVectorById(personaVectorId)
            Logger.logInfo("focusController.ts", "getPersonaVector", `Got PersonaVector with id: ${personaVectorId} -- `)
            return pvResponse
        } catch (error: any) {
            Logger.logWarn("focusController.ts", "getPersonaVector", `Could not find PersonaVector for id: ${personaVectorId}`);
            return null
        }
    }
    // Check for multipart file upload
    else if ((req as any).files && (req as any).files.pv) {
        return await parseRequestResource(req, null, 'pv');
    }
    // Check for multipart file upload
    else if ((req as any).files && (req as any).files.pv) {
        return await parseRequestResource(req, null, 'pv');
    }
    // Otherwise, parse PersonaVector from request body based on Content-Type
    else if (req.body.pv) {
        return await parseRequestResource(req, req.body.pv, 'pv');
    }
    // PersonaVector is optional, so return null if not provided
    return null;
}

const getEpi = async (req: Request, res: Response): Promise<any | null> => {
    // If epiId is provided in params, fetch from FHIR server
    if (req.params.epiId && req.params.epiId !== "undefined") {
        const epiId = req.params.epiId;
        try {
            let epiResponse = await fhirEpiProvider.getEpiById(epiId)
            Logger.logInfo("focusController.ts", "getEpi", `Got ePI with id: ${epiId} -- `)
            return epiResponse.data
        } catch (error: any) {
            if (error.statusCode === 404) {
                res.status(HttpStatusCode.NotFound).send(error)
            } else {
                res.status(HttpStatusCode.InternalServerError).send(error)
            }
            return null
        }
    }
    // Check for multipart file upload
    else if ((req as any).files && (req as any).files.epi) {
        return await parseRequestResource(req, null, 'epi');
    }
    // Otherwise, parse ePI from request body based on Content-Type
    else if (req.body.epi) {
        return await parseRequestResource(req, req.body.epi, 'epi');
    }
    // No ePI provided
    else {
        res.status(HttpStatusCode.BadRequest).send({
            message: "Provide valid epiId parameter or epi in request body."
        })
        return null
    }
}

const getIps = async (req: Request, res: Response): Promise<any | null> => {
    // If patientIdentifier is provided in query, fetch from FHIR server
    if (req.query.patientIdentifier && req.query.patientIdentifier !== "undefined") {
        const patientIdentifier = req.query.patientIdentifier as string;
        try {
            let ipsResponse = await fhirIpsProvider.getIpsByPatientIdentifier(patientIdentifier)
            Logger.logInfo("focusController.ts", "getIps", `Got IPS with patientIdentifier: ${patientIdentifier} -- `)
            return ipsResponse.data
        } catch (error: any) {
            if (error.status == 400 && error.body?.["issue"]?.[0]?.["severity"] == "error") {
                Logger.logInfo('focusController.ts', "getIps", `More than one patient found for the provided identifier: ${patientIdentifier}`);
            }
            const statusCode = error.statusCode || error.status || 500;
            const errorData = error.body?.errorData || error.body || { error: error.message || 'Failed to fetch IPS' };
            res.status(statusCode).send(errorData)
            return null
        }
    }
    // Check for multipart file upload
    else if ((req as any).files && (req as any).files.ips) {
        return await parseRequestResource(req, null, 'ips');
    }
    // Otherwise, parse IPS from request body based on Content-Type
    else if (req.body.ips) {
        return await parseRequestResource(req, req.body.ips, 'ips');
    }
    // No IPS provided
    else {
        res.status(HttpStatusCode.BadRequest).send({
            message: "Provide valid patientIdentifier query parameter or ips in request body."
        })
        return null
    }
}

const getLensesAndPreprocessors = async (req: Request, res: Response) => {
    try {
        // Get lens names from query or all available
        let lensNames: string[] | string;
        if (req.query.lenses) {
            lensNames = req.query.lenses as string;
        } else {
            lensNames = await lensesProvider.getAllAvailableLenses();
        }

        // Normalize to array (Express converts single-item arrays to strings)
        if (typeof lensNames === "string") {
            lensNames = [lensNames];
        }

        // Parse lenses using provider to get selector info
        const parsedLenses = await lensesProvider.parseLenses(lensNames);

        // Get preprocessor names from query or all available
        let preprocessors: string[];
        if (req.query.preprocessors) {
            preprocessors = req.query.preprocessors as string[];
            // Normalize to array (Express converts single-item arrays to strings)
            if (typeof preprocessors === "string") {
                preprocessors = [preprocessors];
            }
        } else {
            preprocessors = await getAllPreprocessorNames();
        }

        return { preprocessors, parsedLenses };
    } catch (error) {
        Logger.logError("focusController.ts", "getLensesAndPreprocessors", `Error: ${error}`);
        res.status(HttpStatusCode.InternalServerError).send({
            error: "Error retrieving lenses and preprocessors"
        });
        return null;
    }
}

const logAndSendResponseWithHeaders = async (req: Request, res: Response, responseMessage: any, statusCode: number = HttpStatusCode.Ok) => {
    console.log("________________")
    console.log("Sending response")
    console.log("________________")

    Logger.logInfo("focusController.ts", "focus", `Result :`)
    let epi: Object;

    // Send processed epi, or raw if the processed one is not found in the object.
    responseMessage.response != undefined && Object.keys(responseMessage.response).length > 0 ? epi = responseMessage.response : epi = responseMessage.request.epi;
    let focusingWarnings = {
        preprocessingWarnings: responseMessage.preprocessingErrors,
        lensesWarnings: responseMessage.focusingErrors
    }
    // Set possible errors as headers
    if (focusingWarnings.preprocessingWarnings.length > 0 || focusingWarnings.lensesWarnings.length > 0) {
        res.set('GH-Focusing-Warnings', JSON.stringify(focusingWarnings))
    }

    // Determine if client explicitly provided an Accept header
    const hasAcceptHeader = req.headers.accept && req.headers.accept.trim().length > 0;
    
    // If no Accept header, default to HTML (no need to check specific formats)
    if (!hasAcceptHeader) {
        try {
            console.log("Converting to html (no Accept header - using default)")
            const templatePath = getTemplatePath('epi.liquid');
            
            if (!existsSync(templatePath)) {
                Logger.logWarn("focusController.ts", "logAndSendResponseWithHeaders", `Template file not found: ${templatePath}`);
                res.set('Content-Type', 'application/json')
                res.status(HttpStatusCode.InternalServerError).send(epi)
                return
            }
            
            const epiTemplate = readFileSync(templatePath, "utf-8")
            const engine = new Liquid()
            const html = await engine.parseAndRender(epiTemplate, epi)
            res.set('Content-Type', 'text/html')
            res.status(statusCode).send(html)
            return
        } catch (error) {
            Logger.logError("focusController.ts", "logAndSendResponseWithHeaders", `Error converting to html: ${error}`)
            res.set('Content-Type', 'application/json')
            res.status(HttpStatusCode.InternalServerError).send(epi)
            return
        }
    }

    // Client has explicit Accept header - check for specific formats
    // Check for explicit format requests (before HTML default)
    // if client accepts XML, set content type to XML
    if (req.accepts('xml') === 'xml') { 
        res.set('Content-Type', 'application/xml')
        // Convert epi to XML string if needed (assuming epi is in JSON format)
        if (typeof epi === 'object') {
            try {
                const json2xml = require('json2xml');
                epi = json2xml(epi);
            } catch (error) {
                Logger.logWarn("focusController.ts", "logAndSendResponseWithHeaders", "Failed to convert to XML, returning JSON");
                res.set('Content-Type', 'application/json');
            }
        }
    }
    // if client accepts turtle, set content type to turtle
    else if (req.accepts('text/turtle') === 'text/turtle' || req.accepts('turtle') === 'turtle') {
        res.set('Content-Type', 'text/turtle')
        // Convert epi to turtle string if needed (assuming epi is in JSON format)
        if (typeof epi === 'object') {
            try {
                // Simple conversion: convert JSON to N-Triples/Turtle-like format
                const turtleLines: string[] = [];
                turtleLines.push('@prefix ex: <http://example.com/> .');
                turtleLines.push('');
                
                const subject = 'ex:epi';
                if (typeof epi === 'object' && epi !== null) {
                    for (const [key, value] of Object.entries(epi)) {
                        if (value !== null && value !== undefined) {
                            const predicate = `ex:${key}`;
                            const val = typeof value === 'string' ? `"${value}"` : String(value);
                            turtleLines.push(`${subject} ${predicate} ${val} .`);
                        }
                    }
                }
                
                epi = turtleLines.join('\n');
            } catch (error) {
                Logger.logWarn("focusController.ts", "logAndSendResponseWithHeaders", "Failed to convert to Turtle, returning JSON");
                res.set('Content-Type', 'application/json');
            }
        }
    }
    // if client accepts HTML, render using Liquid template
    else if (req.accepts('html') === 'html') {
        try {
            console.log("Converting to html (explicit Accept header)")
            const templatePath = getTemplatePath('epi.liquid');
            
            if (!existsSync(templatePath)) {
                Logger.logWarn("focusController.ts", "logAndSendResponseWithHeaders", `Template file not found: ${templatePath}`);
                res.set('Content-Type', 'application/json')
                res.status(HttpStatusCode.InternalServerError).send(epi)
                return
            }
            
            const epiTemplate = readFileSync(templatePath, "utf-8")
            const engine = new Liquid()
            const html = await engine.parseAndRender(epiTemplate, epi)
            res.set('Content-Type', 'text/html')
            res.status(statusCode).send(html)
            return
        } catch (error) {
            Logger.logError("focusController.ts", "logAndSendResponseWithHeaders", `Error converting to html: ${error}`)
            res.set('Content-Type', 'application/json')
            res.status(HttpStatusCode.InternalServerError).send(epi)
            return
        }
    }
    // default to JSON response
    else {
        res.set('Content-Type', 'application/json')
    }

    // Send response independent of the result
    res.status(statusCode).send(epi)
}

const focusProccess = async (req: Request, res: Response, epi: any, ips: any, pv: any, preprocessors: string[] | undefined, parsedLensesNames: any[] | undefined) => {
    // Log too long Logger.logDebug("focusController.ts", "focus", `Got ePI: ${JSON.stringify(epi)}} -- `)

    let responseMessage:
        {
            request: object,
            preprocessingErrors: object[],
            focusingErrors: object[],
            response: object
        } = {
        request: {
            epi: epi,
            ips: ips,
            pv: pv,
            preprocessors: preprocessors,
            lenses: parsedLensesNames
        },
        preprocessingErrors: [],
        focusingErrors: [],
        response: {
        }
    }
    let preprocessingErrors

    // PREPROCESSING 
    if (preprocessors) {
        //TODO: handle caching of preprocessing results
        try {
            [epi, preprocessingErrors] = await preprocessingProvider.callServicesFromList(preprocessors, epi)
        } catch (error) {
            Logger.logError("focusController.ts", "focusProcess", `Error in preprocessing provider, with the following preprocessors: ` + preprocessors)
            Logger.logError("focusController.ts", "focusProcess", `Error in preprocessing provider: ` + JSON.stringify(error));
        }
    }
    responseMessage["preprocessingErrors"] = preprocessingErrors || []

    // LENS RESOLUTION
    let completeLenses: any[] = []
    let lensResolutionErrors: any[] = []
    if (parsedLensesNames && parsedLensesNames.length > 0) {
        const result = await lensesProvider.getCompleteLenses(parsedLensesNames)
        completeLenses = result.completeLenses
        lensResolutionErrors = result.errors
    }
    
    // LENS EXECUTION ENVIRONMENT
    let focusingErrors: any[] = [...lensResolutionErrors]
    try {
        const lensExecutionConfig: LensExecutionConfig = {
            lensExecutionTimeout: LENS_EXECUTION_TIMEOUT,
            logging: getLeeLoggingConfig()
        };
        const lensResult = await applyLenses(epi, ips, completeLenses, pv, lensExecutionConfig)
        epi = lensResult.epi
        focusingErrors = [...lensResolutionErrors, ...lensResult.focusingErrors]
        responseMessage.focusingErrors = focusingErrors
    } catch (err: any) {
        const errMsg = err?.message ?? err;
        focusingErrors.push({ message: errMsg, lensName: "(applyLenses)" });
        responseMessage.focusingErrors = focusingErrors
        Logger.logError("focusController.ts", "focusProcess", `Error applying lenses: ${errMsg}`)
    }

    responseMessage.response = epi;

    // Send response with all format negotiation handled in logAndSendResponseWithHeaders
    await logAndSendResponseWithHeaders(req, res, responseMessage, HttpStatusCode.Ok)
}
