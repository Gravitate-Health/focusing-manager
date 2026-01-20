import { Response, Request } from "express";
import { HttpStatusCode } from "axios";
import { Logger } from "../utils/Logger.js";
import { PreprocessingProvider } from "../providers/preprocessing.provider.js";
import { FhirEpiProvider } from "../providers/fhirEpi.provider.js";
import { FhirIpsProvider } from "../providers/fhirIps.provider.js";
import { LensesProvider } from "../providers/lenses.provider.js";
import { ProfileProvider } from "../providers/profile.provider.js";
import { Liquid } from "liquidjs";
import { readFileSync, stat } from "fs";
import { objectEquals } from "../utils/utils.js"

// Workaround for ESM/CJS interop issue in lens-execution-environment
let applyLenses: any;
async function loadApplyLenses() {
  if (!applyLenses) {
    try {
      // Try ESM import first
      const mod = await import("@gravitate-health/lens-execution-environment");
      applyLenses = mod.applyLenses;
    } catch (e) {
      // Fallback - will be handled at runtime
      console.error("Failed to load applyLenses:", e);
    }
  }
  return applyLenses;
}

const FHIR_IPS_URL = process.env.FHIR_IPS_URL as string;
const FHIR_EPI_URL = process.env.FHIR_EPI_URL as string;
const PROFILE_URL = process.env.PROFILE_URL as string;

let preprocessingProvider = new PreprocessingProvider("")
let lensesProvider = new LensesProvider("")
let fhirEpiProvider = new FhirEpiProvider(FHIR_EPI_URL)
let fhirIpsProvider = new FhirIpsProvider(FHIR_IPS_URL)
let profileProvider = new ProfileProvider(PROFILE_URL)
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

const getAllLensesNames = async (): Promise<string[]> => {
    let lensesList: string[] = [];
    // Get lensSelectors
    let lensSelectorList = await lensesProvider.getLensSelectors()
    for (let i in lensSelectorList) {
        let lensSelectorName = lensSelectorList[i]
        try {
            // Get available lenses from lensSelector
            let response = await lensesProvider.getLensSelectorAvailableLenses(lensSelectorName)
            response["lenses"].forEach((lens: string) => {
            //TODO: this is legacy, remove when all lenses are updated
            if (lens.endsWith('.js')) {
                // Remove .js extension of the lens
                lens = lens.slice(0, lens.length - 3)
            }
            // check if lens exists before pushing
            if (lensesList.includes(`${lens}`)) {
                let fullLensName = `${lensSelectorName}/${lens}`
                Logger.logInfo("lensesController.ts", "getLensesNames",
                    `Lens ${fullLensName} already exists, skipping. You might have duplicate lenses across selectors.`
                );
            } else {
                lensesList.push(lens)
            }
        });
            
        } catch (error) {
            
        }
    }
    return lensesList
}

export const getLensesNames = async (_req: Request, res: Response) => {
    Logger.logInfo("lensesController.ts", "focus", "\n\n\n_____________ GET LENSES ____________")
    let lensesList: string[] = [];
    try {
        lensesList = await getAllLensesNames()
    } catch (error) {
        res.status(HttpStatusCode.InternalServerError).send({
            error: "There was an error"
        })
        return
    }
    res.status(HttpStatusCode.Ok).send({
        lenses: lensesList
    })
}

export const focusEpiIdIpsId = async (req: Request, res: Response) => {
    Logger.logInfo("lensesController.ts", "focus", "\n\n\n_____________ POST FOCUS ____________")
    let preprocessors: string[] | undefined, lensesNames: string[] | string, epi: any, ips: any, pv: any

    let reqEpiId = req.params.epiId as string
    let reqPatientIdentifier = req.query.patientIdentifier as string
    let reqPreprocessors = req.query.preprocessors as string[]
    let reqLensesNames = req.query.lenses as string[]

    if (!reqEpiId || reqEpiId === "undefined") {
        res.status(HttpStatusCode.BadRequest).send({
            message: "Provide valid epiId value."
        })
        return
    } else if (!reqPatientIdentifier || reqPatientIdentifier === "undefined") {
        res.status(HttpStatusCode.BadRequest).send({
            message: "Provide valid patientIdentifier value."
        })
        return
    }

    Logger.logDebug("lensesController.ts", "focus", `epiId: ${reqEpiId} -- patientIdentifier: ${reqPatientIdentifier} -- preprocessors: ${reqPreprocessors} -- lenses: ${reqLensesNames} -- `)

    // get epiId
    try {
        let epiResponse = await fhirEpiProvider.getEpiById(reqEpiId)
        Logger.logInfo("lensesController.ts", "focus", `Got ePI with id: ${reqEpiId} -- `)
        epi = epiResponse.data
    } catch (error: any) {
        if (error.statusCode === 404) {
            res.status(HttpStatusCode.NotFound).send(error)
            return
        }
    }

    // get IPS
    try {
        let ipsResponse = await fhirIpsProvider.getIpsByPatientIdentifier(reqPatientIdentifier)
        Logger.logInfo("lensesController.ts", "focus", `Got IPS with patientIdentifier: ${reqPatientIdentifier} -- `)
        ips = ipsResponse.data
    } catch (error: any) {
        console.log(error);
        if (error.status == 400 && error.body["issue"][0]["severity"] == "error") {
            Logger.logInfo('FhirIpsProvider.ts', "getIpsByPatientIdentifier", `More than one patient found for the provided identifier: ${reqPatientIdentifier}`);
            //throw new Error(`Multiple patient resources found matching provided identifier: ${reqPatientIdentifier}`);
        } else {
            res.status(error.statusCode).send(error.body.errorData)
            return
        }
    }

    if (req.query.lenses) {
        lensesNames = req.query.lenses as string;
    } else {
        lensesNames = await getAllLensesNames();
    }

    if (req.query.preprocessors) {
        reqPreprocessors = req.query.preprocessors as string[];
    } else {
        reqPreprocessors = await getAllPreprocessorNames();
    }


    // TODO: change g-lens profile for PersonaVector
    pv = await personaVectorParser(reqPatientIdentifier);
    preprocessors = await parsePreprocessors(reqPreprocessors, res);
    let parsedLensesNames: any[] | undefined = await parseLenses(lensesNames, res);

    focusProccess(req, res, epi, ips, pv, preprocessors, parsedLensesNames);
}

export const baseRequest = (req: Request, res: Response) => {
    console.log("_________________________________________")
    Logger.logInfo("lensesController.ts", "baseRequest", "\n\n\n_____________ POST /focusing/focus ____________");
    console.log("_________________________________________")

    let bodyIPS = req.query.patientIdentifier ? undefined : req.body.ips;
    let bodyEPI = req.params.epiId ? undefined : req.body.epi;

    if (bodyEPI != undefined && bodyIPS != undefined) {
        focusFullEpiFullIps(req, res);
    } else if (req.query.patientIdentifier && bodyEPI != undefined) {
        focusFullEpiIpsId(req, res);
    } else if (req.params.epiId && bodyIPS != undefined) {
        focusEpiIdFullIps(req, res);
    } else if (req.params.epiId && req.query.patientIdentifier) {
        focusEpiIdIpsId(req, res)
    } else {
        res.status(HttpStatusCode.BadRequest).send({
            message: "Bad request",
            reason: "Missing parameters"
        })
    }
}

const focusFullEpiFullIps = async (req: Request, res: Response) => {
    let ips = req.body.ips;
    let epi = req.body.epi;
    let lenses;
    let reqPreprocessors;

    if (req.query.lenses) {
        lenses = req.query.lenses as string;
    } else {
        lenses = await getAllLensesNames();
    }

    if (req.query.preprocessors) {
        reqPreprocessors = req.query.preprocessors as string[];
    } else {
        reqPreprocessors = await getAllPreprocessorNames();
    }

    let parsedLensesNames: any[] | undefined = await parseLenses(lenses, res);
    let preprocessors: string[] | undefined = await parsePreprocessors(reqPreprocessors, res);
    let pv = await personaVectorParser(req.query.patientIdentifier as string);
    focusProccess(req, res, epi, ips, pv, preprocessors, parsedLensesNames);
}

const focusFullEpiIpsId = async (req: Request, res: Response) => {
    const reqPatientIdentifier = req.query.patientIdentifier as string;
    let epi = req.body.epi;
    let ips: any;
    let lenses;
    let reqPreprocessors;

    if (!reqPatientIdentifier || reqPatientIdentifier === "undefined") {
        res.status(HttpStatusCode.BadRequest).send({
            message: "Provide valid patientIdentifier value."
        })
        return
    }

    try {
        let ipsResponse = await fhirIpsProvider.getIpsByPatientIdentifier(reqPatientIdentifier)
        ips = ipsResponse.data
    } catch (error: any) {
        if (error.statusCode === 404) {
            res.status(HttpStatusCode.NotFound).send(error)
            return
        }
    }


    if (req.query.lenses) {
        lenses = req.query.lenses as string;
    } else {
        lenses = await getAllLensesNames();
    }

    if (req.query.preprocessors) {
        reqPreprocessors = req.query.preprocessors as string[];
    } else {
        reqPreprocessors = await getAllPreprocessorNames();
    }

    let parsedLensesNames: any[] | undefined = await parseLenses(lenses, res);
    let preprocessors: string[] | undefined = await parsePreprocessors(reqPreprocessors, res);
    let pv = await personaVectorParser(req.query.patientIdentifier as string);

    focusProccess(req, res, epi, ips, pv, preprocessors, parsedLensesNames);
}

const focusEpiIdFullIps = async (req: Request, res: Response) => {
    const epiId = req.params.epiId;
    let epi: any;
    let ips = req.body.ips;
    let lenses;
    let reqPreprocessors;

    if (!epiId || epiId === "undefined") {
        res.status(HttpStatusCode.BadRequest).send({
            message: "Provide valid epiId value."
        })
        return
    }

    try {
        let epiResponse = await fhirEpiProvider.getEpiById(epiId as string)
        epi = epiResponse.data
    } catch (error: any) {
        if (error.statusCode === 404) {
            res.status(HttpStatusCode.NotFound).send(error)
            return
        }
    }


    if (req.query.lenses) {
        lenses = req.query.lenses as string;
    } else {
        lenses = await getAllLensesNames();
    }

    if (req.query.preprocessors) {
        reqPreprocessors = req.query.preprocessors as string[];
    } else {
        reqPreprocessors = await getAllPreprocessorNames();
    }

    let parsedLensesNames: any[] | undefined = await parseLenses(lenses, res);
    let preprocessors: string[] | undefined = await parsePreprocessors(req.query.preprocessors as string[], res);
    let pv = await personaVectorParser(req.query.patientIdentifier as string);
    focusProccess(req, res, epi, ips, pv, preprocessors, parsedLensesNames);
}

const parseLenses = async (reqLensesNames: string[] | string, res: Response) => {
    // Parse lenses
    let parsedLensesNames: any[] = []
    try {
        parsedLensesNames = await lensesProvider.parseLenses(reqLensesNames);
        return parsedLensesNames;
    } catch (error) {
        res.status(HttpStatusCode.InternalServerError).send({
            error: error
        })
        return
    }
}

const parsePreprocessors = async (reqPreprocessors: string[], res: Response) => {
    // Parse preprocessors
    let preprocessors: string[] | undefined;
    try {
        preprocessors = await preprocessingProvider.parsePreprocessors(reqPreprocessors)
        return preprocessors;
    } catch (error) {
        res.status(HttpStatusCode.InternalServerError).send({
            error: "There was an error parsing preprocessors"
        })
        return
    }
}

const personaVectorParser = async (partientId: string) => {
    // TODO: change g-lens profile for PersonaVector
    try {
        let pv = await profileProvider.getProfileById(partientId)
        Logger.logDebug("lensesController.ts", "focus", `Got G-Lens profile: ${JSON.stringify(pv)}} -- `)
        return pv;
    } catch (error: any) {
        console.log(`Could not find G-Lens Profile por Patient id: ${partientId}`);
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
        //TODO: timeout for preprocessing
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
    console.log(parsedLensesNames)
    if (parsedLensesNames) {
        for (let i in parsedLensesNames) {
            let lensObj = parsedLensesNames[i]
            try {
                let lens = await lensesProvider.getLensFromSelector(lensObj["lensSelector"], lensObj["lensName"])
                completeLenses.push(lens)
            } catch (error) {
                console.log(error);
            }
        }
    } else {

    }
    
    // LENS EXECUTION ENVIRONMENT
    let focusingErrors: any[] = []
    const { applyLenses: applyLensesFunc } = await loadApplyLenses();
    const lensResult = await applyLensesFunc(epi, ips, completeLenses)
    epi = lensResult.epi
    focusingErrors = lensResult.focusingErrors
    responseMessage.focusingErrors = focusingErrors

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