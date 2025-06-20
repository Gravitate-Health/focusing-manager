import { Response, Request } from "express";
import { HttpStatusCode } from "axios";
import { Logger } from "../utils/Logger";
import { PreprocessingProvider } from "../providers/preprocessing.provider";
import { FhirEpiProvider } from "../providers/fhirEpi.provider";
import { FhirIpsProvider } from "../providers/fhirIps.provider";
import { LensesProvider } from "../providers/lenses.provider";
import { ProfileProvider } from "../providers/profile.provider";
import { Liquid } from "liquidjs";
import { readFileSync, stat } from "fs";
import { objectEquals } from "../utils/utils"
import { createExplanation } from "./explanationController";
import JSDOM from "jsdom";
import { explanation } from "../templates/explanationTemplate";

const FHIR_IPS_URL = process.env.FHIR_IPS_URL as string;
const FHIR_EPI_URL = process.env.FHIR_EPI_URL as string;
const PROFILE_URL = process.env.PROFILE_URL as string;

let preprocessingProvider = new PreprocessingProvider("")
let lensesProvider = new LensesProvider("")
let fhirEpiProvider = new FhirEpiProvider(FHIR_EPI_URL)
let fhirIpsProvider = new FhirIpsProvider(FHIR_IPS_URL)
let profileProvider = new ProfileProvider(PROFILE_URL)
let lensApplied = false

const getLeaflet = (epi: any) => {
    // This is assuming that the "Composition" resource is the first one of the bundle. It might break in the future
    let leafletSectionList = epi['entry'][0]['resource']['section'][0]['section']
    return leafletSectionList
}

const getCategoryCode = (epi: any) => {
    // This is assuming that the "Composition" resource is the first one of the bundle. It might break in the future
    try {
        let codeCategory = epi['entry'][0]['resource']['category'][0]['coding'][0]["code"]
        return codeCategory
    } catch (error) {
    }

    return null
}

const setCategoryCode = (epi: any, code: string, display: string) => {
    // This is assuming that the "Composition" resource is the first one of the bundle. It might break in the future
    epi['entry'][0]['resource']['category'][0]['coding'][0]["code"] = code
    epi['entry'][0]['resource']['category'][0]['coding'][0]["display"] = display
    return epi;
}

const getExtensions = (epi: any) => {
    // This is assuming that the "Composition" resource is the first one of the bundle. It might break in the future
    let codeCategory = epi['entry'][0]['resource']['extension']
    return codeCategory
}

const getPatientIdentifierFromPatientSummary = (ips: any) => {
    let patientIdentifier = ips['entry'][1]['resource']['identifier'][0]['value']
    return patientIdentifier
}

const setExtensions = (epi: any, extensions: any) => {
    // This is assuming that the "Composition" resource is the first one of the bundle. It might break in the future
    epi['entry'][0]['resource']['extension'] = extensions
    return epi
}

const writeLeaflet = (epi: any, leafletSectionList: any[]) => {
    // This is assuming that the "Composition" resource is the first one of the bundle. It might break in the future
    epi['entry'][0]['resource']['section'][0]['section'] = leafletSectionList
    return epi
}

const getAllPreprocessorNames = async (): Promise<string[]> => {
    let preprocessorsList: string[] = [];
    // Get preprocessors
    let preprocessors = await preprocessingProvider.queryPreprocessingServices()
    for (let i in preprocessors) {
        let preprocessor = preprocessors[i]
        preprocessorsList.push(preprocessor)
    }
    return preprocessorsList
}

const getAllLensesNames = async (): Promise<string[]> => {
    let lensesList: string[] = [];
    // Get lensSelectors
    let lensSelectorList = await lensesProvider.getLensSelectors()
    for (let i in lensSelectorList) {
        let lensSelectorName = lensSelectorList[i]
        // Get available lenses from lensSelector
        let response = await lensesProvider.getLensSelectorAvailableLenses(lensSelectorName)
        response["lenses"].forEach((lens: string) => {
            if (lens.endsWith('.js')) {
                // Remove .js extension of the lens
                lens = lens.slice(0, lens.length - 3)
            }
            lensesList.push(lens)
        });
    }
    return lensesList
}

const getLensesIdenfier = (lens: any) => {
    let lensIdentifier = lens["identifier"][0]["value"]
    return lensIdentifier
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

const logAndSendResponseWithHeaders = (res: Response, responseMessage: any, statusCode: HttpStatusCode = HttpStatusCode.Ok) => {
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

let getLeafletHTMLString = (leafletSectionList: any[]) => {
    let htmlString = "";
    for (let i in leafletSectionList) {
        let section = leafletSectionList[i];
        if (section['text'] && section['text']['div']) {
            htmlString += section['text']['div'];
        }
        if (section['section']) {
            htmlString += getLeafletHTMLString(section['section']);
        }
        if (section['entry']) {
            for (let j in section['entry']) {
                let entry = section['entry'][j];
                if (entry['resource'] && entry['resource']['text'] && entry['resource']['text']['div']) {
                    htmlString += entry['resource']['text']['div'];
                }
                if (entry['resource'] && entry['resource']['section']) {
                    htmlString += getLeafletHTMLString(entry['resource']['section']);
                }
            }
        }
    }

    return htmlString;
}

let getLeafletSectionListFromHTMLString = (html: string, leafletSectionList: any[]) => {
    // Parse HTML and extract leaflet sections, which are divs with a xmlns="http://www.w3.org/1999/xhtml" attribute, and add them to the leafletSectionList
    const dom = new JSDOM.JSDOM(html);
    const document = dom.window.document;
    const divs = document.querySelectorAll('div[xmlns="http://www.w3.org/1999/xhtml"]');
    let newLeafletSectionList: any[] = [];

    for (let i = 0; i < divs.length; i++) {
        let div = divs[i];
        let sectionTitle = leafletSectionList[i]?.title;
        let sectionCode = leafletSectionList[i]?.code;
        if (div == undefined) {
            continue;
        }
        if (sectionTitle == undefined) {
            sectionTitle = div.querySelector('h1, h2, h3, h4, h5, h6')?.textContent || "Section " + (i + 1);
        }

        if (sectionCode == undefined) {
            sectionCode = {
                coding: [{
                    system: "http://hl7.org/fhir/CodeSystem/section-code",
                    code: "section-" + (i + 1),
                    display: sectionTitle
                }]
            };
        }

        let sectionObject: any = {
            title: sectionTitle,
            code: sectionCode,
            text: {
                status: "additional",
                div: div.outerHTML
            }
        };
        newLeafletSectionList.push(sectionObject);
    }

    return newLeafletSectionList;
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

    if (preprocessors) {
        try {
            let categoryCode = getCategoryCode(epi)
            if (categoryCode == "R" || categoryCode == "" || categoryCode == null) {
                [epi, preprocessingErrors] = await preprocessingProvider.callServicesFromList(preprocessors, epi)
            }
        } catch (error) {
            Logger.logError("lensesController.ts", "focusProcess", `Error in preprocessing provider, with the following preprocessors: ` + preprocessors)
            Logger.logError("lensesController.ts", "focusProcess", `Error in preprocessing provider: ` + JSON.stringify(error));
        }
    }
    responseMessage["preprocessingErrors"] = preprocessingErrors || []

    // IF EPI IS NOT PREPROCESSED, RETURN RAW EPI AND STOP FOCUSING PROCESS. DO NOT EXECUTE LENSES
    // OR
    // IF EPI IS MARKED AS PREPROCESSED BUT NO CATEGORIES ARE PRESENT, RETURN
    let epiWasNotPreprocessed = false
    if (getCategoryCode(epi) == "R") {
        epiWasNotPreprocessed = objectEquals(epi, originalEpi)
    }
    let epiCategoryCoding = getCategoryCode(epi);
    let epiExtensions = getExtensions(epi);
    if (epiWasNotPreprocessed || epi == null || epiCategoryCoding == "R" || epiCategoryCoding == null || epiExtensions == undefined || epiExtensions == null || epiExtensions.length == 0) {
        Logger.logInfo("lensesController.ts", "focusProcess", `EPI was not preprocessed or no categories found. Stopping focusing process and returning raw ePI.`)
        // CONVERT TO "R" IN CASE IT WAS MARKED AS "P"
        preprocessors?.forEach(preprocessorName => {
            responseMessage["preprocessingErrors"].push({ serviceName: preprocessorName, error: "Preprocessed version of ePI could not be handled by preprocessor." })
        })
        logAndSendResponseWithHeaders(res, responseMessage)
        return
    }

    let lenses = []
    let completeLenses = []
    console.log(parsedLensesNames)
    if (parsedLensesNames) {
        for (let i in parsedLensesNames) {
            let lensObj = parsedLensesNames[i]
            try {
                let lens = await lensesProvider.getLensFromSelector(lensObj["lensSelector"], lensObj["lensName"])
                completeLenses.push(lens)
                const lensBase64data = lens.content[0].data
                lenses.push(atob(lensBase64data))
            } catch (error) {
                console.log(error);
            }
        }
    } else {

    }
    Logger.logInfo("lensesController.ts", "focusProcess", `Found the following lenses: ${JSON.stringify(lenses)}`);

    // Get leaflet sectoins from ePI
    let leafletSectionList = getLeaflet(epi)

    // Iterate lenses
    for (let i in lenses) {
        let lense = lenses[i]
        let lensFullName = `${parsedLensesNames![i].lensSelector}_${parsedLensesNames![i].lensName}`
        lensApplied = false

        // If there are lenses, we can already mark the ePI as enhanced
        epi = setCategoryCode(epi, "E", "Enhanced")
        
        let lensIdentifier = getLensesIdenfier(completeLenses[i])
        let epiLanguage = epi['entry'][0]['resource']['language']
        let patientIdentifier = getPatientIdentifierFromPatientSummary(ips)
        
        let lensApplication = await applyLensToSections(lense, leafletSectionList, lensFullName, responseMessage, epi, ips, completeLenses, res)

        if (lensApplied) {
            leafletSectionList = lensApplication.leafletSectionList
            let explanationText = lensApplication.explanation || await createExplanation(patientIdentifier, epiLanguage, lensIdentifier)

            if (explanationText != undefined && explanationText != "") {
                let epiExtensions = getExtensions(epi)
                epiExtensions.push({
                    "extension": [
                        {
                            "url": "lens",
                            "valueCodeableReference": {
                                "reference": {
                                    "reference": "Library/" + lensIdentifier
                                }
                            }
                        },
                        {
                            "url": "elementClass",
                            "valueString": lensIdentifier
                        },
                        {
                            "url": "explanation",
                            "valueString": explanationText
                        }
                    ],
                    "url": "http://hl7.eu/fhir/ig/gravitate-health/StructureDefinition/LensesApplied"
                })
            }

            epi = setExtensions(epi, epiExtensions)
        }

    }
    epi = writeLeaflet(epi, leafletSectionList)

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

const applyLensToSections = async (lense: string, leafletSectionList: any[], lensFullName: string, responseMessage: any, epi: any, ips: any, completeLenses: any, res: Response) => {
    try {
        // Iterate on leaflet sections
        // I want to only execute the lens all sections at a time, so I will not use a forEach
        Logger.logInfo("lensesController.ts", "focusProcess", `Applying lens ${lensFullName} to leaflet sections`)
        if (leafletSectionList == undefined || leafletSectionList.length == 0) {
            responseMessage.focusingErrors.push({
                message: "No leaflet sections found",
                lensName: lensFullName
            })
            return {
                leafletSectionList: leafletSectionList,
                explanation: ""
            }
        }
        if (lense == undefined || lense == "") {
            responseMessage.focusingErrors.push({
                message: "Lens is undefined or empty",
                lensName: lensFullName
            })
            return {
                leafletSectionList: leafletSectionList,
                explanation: ""
            }
        }
        if (typeof lense !== 'string') {
            responseMessage.focusingErrors.push({
                message: "Lens is not a string",
                lensName: lensFullName
            })
            return {
                leafletSectionList: leafletSectionList,
                explanation: ""
            }
        }

        let leafletHTMLString = getLeafletHTMLString(leafletSectionList)
        let explanation = ""

        // Create enhance function from lens
        let lensFunction = new Function("epi, ips, pv, html", lense)
        let resObject = lensFunction(epi, ips, {}, leafletHTMLString)
        try {
            // Execute lense and save result on ePI leaflet section
            let enhancedHtml = await resObject.enhance()
            // If the lens has an explanation function, execute it
            if (resObject.explanation == undefined || resObject.explanation == null || typeof resObject.explanation !== 'function') {
                Logger.logInfo("lensesController.ts", "focusProcess", `Lens ${lensFullName} does not have an explanation function, using empty string`)
                resObject.explanation = async () => {
                    return ""
                }
            }
            
            explanation = await resObject.explanation()
            const diff = leafletHTMLString.localeCompare(enhancedHtml)
            if (diff != 0) {
                lensApplied = true
                Logger.logInfo("lensesController.ts", "focusProcess", `Lens ${lensFullName} applied to leaflet sections`)
            }

            leafletSectionList = getLeafletSectionListFromHTMLString(enhancedHtml, leafletSectionList)
        } catch (error) {
            Logger.logError("lensesController.ts", "focusProcess", `Error executing lens ${lensFullName} on leaflet sections`)
            console.error(error);
            responseMessage.focusingErrors.push({
                message: "Error executing lens",
                lensName: lensFullName
            })
            return {
                leafletSectionList: leafletSectionList,
                explanation: ""
            }
        }

        return {
            leafletSectionList: leafletSectionList,
            explanation: explanation || ""
        }
    } catch (error: any) {
        console.log(error);
        console.log("finished before expected!")
        logAndSendResponseWithHeaders(res, responseMessage, HttpStatusCode.InternalServerError)
        return {
            leafletSectionList: leafletSectionList,
            explanation: ""
        }
    }
}