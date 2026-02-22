import { Response, Request } from "express";
import { HttpStatusCode } from "axios";
import { Logger } from "../utils/Logger";
import { PreprocessingProvider } from "../providers/preprocessing.provider";
import { FhirEpiProvider } from "../providers/fhirEpi.provider";
import { FhirIpsProvider } from "../providers/fhirIps.provider";
import { LensesProvider } from "../providers/lenses.provider";
import { PersonaVectorProvider } from "../providers/personaVector.provider";
import { Liquid } from "liquidjs";
import { readFileSync } from "fs";
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
        
        Logger.logDebug("lensesController.ts", "parseRequestResource", 
            `Parsing ${resourceName} from multipart (mimetype: ${file.mimetype}, format: ${format})`);
        
        try {
            const result = parseFhirResource(content, format);
            // Handle both sync (JSON/XML) and async (RDF) results
            return await Promise.resolve(result);
        } catch (error: any) {
            Logger.logError("lensesController.ts", "parseRequestResource", 
                `Failed to parse ${resourceName} from multipart: ${error.message}`);
            throw new Error(`Invalid ${format.toUpperCase()} format for ${resourceName}`);
        }
    }
    
    // Fallback to original logic for JSON body
    const contentType = req.get('Content-Type');
    const format = getFhirFormatFromContentType(contentType);
    
    Logger.logDebug("lensesController.ts", "parseRequestResource", 
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
            Logger.logError("lensesController.ts", "parseRequestResource", 
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

export const getLensesNames = async (_req: Request, res: Response) => {
    Logger.logInfo("lensesController.ts", "getLensesNames", "\n\n\n_____________ GET LENSES ____________")
    try {
        const lensesList = await lensesProvider.getAllAvailableLenses()
        res.status(HttpStatusCode.Ok).send({
            lenses: lensesList
        })
    } catch (error) {
        Logger.logError("lensesController.ts", "getLensesNames", `Error: ${error}`)
        res.status(HttpStatusCode.InternalServerError).send({
            error: "There was an error retrieving lenses"
        })
    }
}

export const focus = async (req: Request, res: Response) => {
    console.log("_________________________________________")
    Logger.logInfo("lensesController.ts", "focus", "\n\n\n_____________ POST /focusing/focus ____________");
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
            Logger.logInfo("lensesController.ts", "getPersonaVector", `Got PersonaVector with id: ${personaVectorId} -- `)
            return pvResponse
        } catch (error: any) {
            Logger.logWarn("lensesController.ts", "getPersonaVector", `Could not find PersonaVector for id: ${personaVectorId}`);
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
            Logger.logInfo("lensesController.ts", "getEpi", `Got ePI with id: ${epiId} -- `)
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
            Logger.logInfo("lensesController.ts", "getIps", `Got IPS with patientIdentifier: ${patientIdentifier} -- `)
            return ipsResponse.data
        } catch (error: any) {
            if (error.status == 400 && error.body?.["issue"]?.[0]?.["severity"] == "error") {
                Logger.logInfo('lensesController.ts', "getIps", `More than one patient found for the provided identifier: ${patientIdentifier}`);
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
        Logger.logError("lensesController.ts", "getLensesAndPreprocessors", `Error: ${error}`);
        res.status(HttpStatusCode.InternalServerError).send({
            error: "Error retrieving lenses and preprocessors"
        });
        return null;
    }
}

const logAndSendResponseWithHeaders = (res: Response, responseMessage: any, statusCode: number = HttpStatusCode.Ok) => {
    console.log("________________")
    console.log("Sending response")
    console.log("________________")

    Logger.logInfo("lensesController.ts", "focus", `Result :`)
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

    // check accept header to decide response format
    // if client accepts XML, set content type to XML and convert epi to XML string if it's an object
    if (res.req.accepts('xml') == 'xml') { 
        res.set('Content-Type', 'application/xml')
        // Convert epi to XML string if needed (assuming epi is in JSON format)
        if (typeof epi === 'object') {
            const json2xml = require('json2xml');
            epi = json2xml(epi);
        }
    }
    // if client accepts turtle, set content type to turtle and convert epi to turtle string if it's an object
    else if (res.req.accepts('text/turtle') == 'text/turtle') {
        res.set('Content-Type', 'text/turtle')
        // Convert epi to turtle string if needed (assuming epi is in JSON format)
        if (typeof epi === 'object') {
            const json2rdf = require('json2rdf');
            epi = json2rdf(epi, { format: 'turtle' });
        }
    // default to JSON response
    }else {
        res.set('Content-Type', 'application/json')
    }

    // Send response independent of the result
    res.status(statusCode).send(epi)
}

const focusProccess = async (req: Request, res: Response, epi: any, ips: any, pv: any, preprocessors: string[] | undefined, parsedLensesNames: any[] | undefined) => {
    // Log too long Logger.logDebug("lensesController.ts", "focus", `Got ePI: ${JSON.stringify(epi)}} -- `)

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
            Logger.logError("lensesController.ts", "focusProcess", `Error in preprocessing provider, with the following preprocessors: ` + preprocessors)
            Logger.logError("lensesController.ts", "focusProcess", `Error in preprocessing provider: ` + JSON.stringify(error));
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
        Logger.logError("lensesController.ts", "focusProcess", `Error applying lenses: ${errMsg}`)
    }

    responseMessage.response = epi;


    //Check if is HTML response
    if (req.accepts('html') == 'html') {
        try {
            console.log("Converting to html")
            const epiTemplate = readFileSync(`${process.cwd()}/templates/epi.liquid`, "utf-8")

            const engine = new Liquid()
            engine.parseAndRender(epiTemplate, epi)
                .then(html => {
                    res.set('Content-Type', 'text/html')
                    responseMessage.response = html
                    logAndSendResponseWithHeaders(res, responseMessage, HttpStatusCode.Ok)
                    return
                });

        } catch (error) {
            Logger.logError("lensesController.ts", "focusProcess", `Error converting to html`)
            console.log(error);
            logAndSendResponseWithHeaders(res, responseMessage, HttpStatusCode.InternalServerError)
            return
        }
    }
    else {//Response with e(ePi)
        logAndSendResponseWithHeaders(res, responseMessage, HttpStatusCode.Ok)
        return
    }
}