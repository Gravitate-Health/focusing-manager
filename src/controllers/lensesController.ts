import { Response, Request } from "express";
import { HttpStatusCode } from "axios";
import { Logger } from "../utils/Logger";
import { PreprocessingProvider } from "../providers/preprocessing.provider";
import { FhirEpiProvider } from "../providers/fhirEpi.provider";
import { FhirIpsProvider } from "../providers/fhirIps.provider";
import { LensesProvider } from "../providers/lenses.provider";
import { PersonaVectorProvider } from "../providers/personaVector.provider";
import { Liquid } from "liquidjs";
import { readFileSync, stat } from "fs";
import { objectEquals } from "../utils/utils"
import { applyLenses, LensExecutionConfig } from "@gravitate-health/lens-execution-environment";

const FHIR_IPS_URL = process.env.FHIR_IPS_URL as string;
const FHIR_EPI_URL = process.env.FHIR_EPI_URL as string;
const PERSONA_VECTOR_URL = process.env.PERSONA_VECTOR_URL as string;
const LENS_EXECUTION_TIMEOUT = parseInt(process.env.LENS_EXECUTION_TIMEOUT || "1000", 10);

let preprocessingProvider = new PreprocessingProvider("")
let lensesProvider = new LensesProvider("")
let fhirEpiProvider = new FhirEpiProvider(FHIR_EPI_URL)
let fhirIpsProvider = new FhirIpsProvider(FHIR_IPS_URL)
let personaVectorProvider = new PersonaVectorProvider(PERSONA_VECTOR_URL)
let lensApplied = false

// Helper function to find a resource by type - handles both bundles and direct resources
const findResourceByType = (resource: any, resourceType: string): any => {
    if (!resource) {
        return null;
    }
    
    // If it's the resource we're looking for, return it
    if (resource.resourceType === resourceType) {
        return resource;
    }
    
    // If it's a Bundle, search in entries
    if (resource.resourceType === "Bundle" && resource.entry && Array.isArray(resource.entry)) {
        const entry = resource.entry.find((e: any) => 
            e.resource && e.resource.resourceType === resourceType
        );
        return entry ? entry.resource : null;
    }
    
    // Resource not found
    return null;
}

const getCategoryCode = (epi: any) => {
    const composition = findResourceByType(epi, "Composition");
    if (!composition) {
        Logger.logWarn("lensesController.ts", "getCategoryCode", "Composition resource not found");
        return null;
    }
    
    try {
        return composition.category?.[0]?.coding?.[0]?.code || null;
    } catch (error) {
        Logger.logWarn("lensesController.ts", "getCategoryCode", "Could not extract category code");
        return null;
    }
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
    const pv = await getPersonaVector(req, res);

    focusProccess(req, res, epi, ips, pv, preprocessors, parsedLenses);
}

const getPersonaVector = async (req: Request, res: Response): Promise<any | null> => {
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
    // Otherwise, use PersonaVector from request body
    else if (req.body.pv) {
        return req.body.pv;
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
    // Otherwise, use ePI from request body
    else if (req.body.epi) {
        return req.body.epi;
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
            if (error.status == 400 && error.body["issue"][0]["severity"] == "error") {
                Logger.logInfo('lensesController.ts', "getIps", `More than one patient found for the provided identifier: ${patientIdentifier}`);
            }
            res.status(error.statusCode).send(error.body.errorData)
            return null
        }
    }
    // Otherwise, use IPS from request body
    else if (req.body.ips) {
        return req.body.ips;
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

    // Send response independent of the result
    res.status(statusCode).send(epi)
}

const focusProccess = async (req: Request, res: Response, epi: any, ips: any, pv: any, preprocessors: string[] | undefined, parsedLensesNames: any[] | undefined) => {
    // Log too long Logger.logDebug("lensesController.ts", "focus", `Got ePI: ${JSON.stringify(epi)}} -- `)
    var originalEpi = JSON.parse(JSON.stringify(epi));

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
            lensExecutionTimeout: LENS_EXECUTION_TIMEOUT
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

const getExtensions = (epi: any) => {
    const composition = findResourceByType(epi, "Composition");
    return composition.extension || [];
}