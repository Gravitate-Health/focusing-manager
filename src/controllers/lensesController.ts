import { Response, Request } from "express";
import { HttpStatusCode } from "axios";
import { Logger } from "../utils/Logger";
import { PreprocessingProvider } from "../providers/preprocessing.provider";
import { FhirEpiProvider } from "../providers/fhirEpi.provider";
import { FhirIpsProvider } from "../providers/fhirIps.provider";
import { LensesProvider } from "../providers/lenses.provider";

const FHIR_IPS_URL = process.env.FHIR_IPS_URL as string;
const FHIR_EPI_URL = process.env.FHIR_EPI_URL as string;

let preprocessingProvider = new PreprocessingProvider("")
let lensesProvider = new LensesProvider("")
let fhirEpiProvider = new FhirEpiProvider(FHIR_EPI_URL)
let fhirIpsProvider = new FhirIpsProvider(FHIR_IPS_URL)

const getLeaflet = (epi: any) => {
    // This is assuming that the "Composition" resource is the first one of the bundle. It might break in the future
    let leafletSectionList = epi['entry'][0]['resource']['section'][0]['section']
    return leafletSectionList
}

const writeLeaflet = (epi: any, leafletSectionList: any[]) => {
    // This is assuming that the "Composition" resource is the first one of the bundle. It might break in the future
    epi['entry'][0]['resource']['section'][0]['section'] = leafletSectionList
    return epi
}

export const getLensesNames = async (_req: Request, res: Response) => {
    Logger.logInfo("lensesController.ts", "focus", "\n\n\n_____________ GET LENSES ____________")
    let lensesList: string[] = [];
    try {
        // Get lensSelectors
        let lensSelectorList = await lensesProvider.getLensSelectors()
        for (let i in lensSelectorList) {
            let lensSelectorName = lensSelectorList[i]
            // Get available lenses from lensSelector
            let response = await lensesProvider.getLensSelectorAvailableLenses(lensSelectorName)
            response["lenses"].forEach((lens: string) => {
                lensesList.push(lens)
            });
        }
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

export const focus = async (req: Request, res: Response) => {
    Logger.logInfo("lensesController.ts", "focus", "\n\n\n_____________ POST FOCUS ____________")
    let epiId: string, patientId: string, preprocessors: string[] | undefined, lensesNames: string[], epi: any, ips: any, pv: any

    let reqEpiId = req.params.epiId as string
    let reqPatientId = req.query.patientId as string
    let reqPreprocessors = req.query.preprocessors as string[]
    let reqLensesNames = req.query.lenses as string[]

    if (!reqEpiId || reqEpiId === "undefined") {
        res.status(HttpStatusCode.BadRequest).send({
            message: "Provide valid epiId value."
        })
        return
    } else if (!reqPatientId || reqPatientId === "undefined") {
        res.status(HttpStatusCode.BadRequest).send({
            message: "Provide valid patientId value."
        })
        return
    } else if (!reqLensesNames || reqLensesNames === undefined) {
        res.status(HttpStatusCode.BadRequest).send({
            message: "Provide valid lenses list."
        })
        return
    }
    Logger.logDebug("lensesController.ts", "focus", `epiId: ${reqEpiId} -- patientId: ${reqPatientId} -- preprocessors: ${reqPreprocessors} -- lenses: ${reqLensesNames} -- `)

    // get epiId
    try {
        let epiResponse = await fhirEpiProvider.getEpiById(reqEpiId)
        epi = epiResponse.data
    } catch (error: any) {
        if (error.statusCode === 404) {
            res.status(HttpStatusCode.NotFound).send(error)
            return
        }
    }

    // get IPS
    try {
        let ipsResponse = await fhirIpsProvider.getIpsByPatientId(reqPatientId)
        ips = ipsResponse.data
    } catch (error: any) {
        if (error.statusCode === 404) {
            res.status(HttpStatusCode.NotFound).send(error)
            return
        }
    }

    // TODO: get PV
    try {
        pv = {}
    } catch (error: any) {
    }

    // Parse preprocessors
    try {
        preprocessors = await preprocessingProvider.parsePreprocessors(reqPreprocessors)
    } catch (error) {
        res.status(HttpStatusCode.InternalServerError).send({
            error: "There was an error"
        })
        return
    }

    // Parse lenses
    let parsedLensesNames: any[] = []
    try {
        parsedLensesNames = await lensesProvider.parseLenses(reqLensesNames)
    } catch (error) {
        res.status(HttpStatusCode.InternalServerError).send({
            error: error
        })
        return
    }

    Logger.logDebug("lensesController.ts", "focus", `Starting Focusing with: EpiId ${reqEpiId} -- patientId: ${reqPatientId} -- preprocessors: ${preprocessors} -- lenses: ${JSON.stringify(parsedLensesNames)} -- `)

    // Call preprocessors
    if (preprocessors) {
        try {
            epi = await preprocessingProvider.callServicesFromList(preprocessors, epi)
        } catch (error) {

        }
    }

    let lenses = []
    if (parsedLensesNames) {
        for (let i in parsedLensesNames) {
            let lensObj = parsedLensesNames[i]
            try {
                let lens = await lensesProvider.getLensFromSelector(lensObj["lensSelector"], lensObj["lensName"])
                lenses.push(lens)
            } catch (error) {
                console.log(error);
            }
        }
    }
    console.log(`Found the following lenses: ${JSON.stringify(lenses)}`);

    // Get leaflet sectoins from ePI
    let leafletSectionList = getLeaflet(epi)

    // Iterate lenses
    lenses.forEach(async lense => {
        try {
            // Iterate on leaflet sections
            for (let index in leafletSectionList) {
                console.log(`Executing lens ${JSON.stringify(lense.metadata)} on leaflet section number: ${index}`);
                // Get HTML text
                let sectionObject = leafletSectionList[index]
                let html = sectionObject['text']['div']

                // Create enhance function from lens
                let lensFunction = new Function("epi, ips, pv, html", lense.lens)
                let resObject = lensFunction(epi, ips, pv, html)

                // Execute lense and save result on ePI leaflet section
                let enhancedHtml = resObject.enhance()
                leafletSectionList[index]['text']['div'] = enhancedHtml
            }

        } catch (error) {
            console.log(error);
            res.status(HttpStatusCode.InternalServerError).send(error)
        }
    })
    epi = writeLeaflet(epi, leafletSectionList)

    res.status(HttpStatusCode.Ok).send(epi) //Response with e(ePi)
}
