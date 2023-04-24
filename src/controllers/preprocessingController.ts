
import { getK8sServicesByLabel } from "../utils/k8sClient";
import { Logger } from "../utils/Logger";
import axios, { AxiosError, HttpStatusCode } from "axios";
import { Response, Request } from "express";
import { FhirEpiController } from "../providers/fhirEpi.provider";

const PREPROCESSING_LABEL_SELECTOR = process.env.PREPROCESSING_LABEL_SELECTOR || "";
const FHIR_BASE_URL = process.env.FHIR_EPI_URL as string;

let fhirEpiController = new FhirEpiController(FHIR_BASE_URL)

const queryPreprocessingServices = () => {
  return getK8sServicesByLabel(PREPROCESSING_LABEL_SELECTOR)
}

async function callPreprocessingService(serviceName: string, epi: any) {
  let url = `http://${serviceName}.default.svc.cluster.local/preprocessing`;
  Logger.logInfo('focusing.ts', 'callPreprocessingService', `Querying preprocessing service: ${url}`)
  try {
    let response = await axios.post(url, epi)
    return response.data
  } catch (error) {
    Logger.logError('focusing.ts', 'callPreprocessingService', `Error querying preprocessing service: ${url}`)
    throw error
  }

}

export const getPreprocessingServices = async (_req: Request, res: Response) => {
  let preprocessingServiceList: string[];
  try {
    preprocessingServiceList = await queryPreprocessingServices() as string[]
  } catch (error) {
    console.error(error)
    res.status(HttpStatusCode.InternalServerError).send({
      error: "There was an error"
    })
    return
  }
  Logger.logInfo("focusingController.ts", "focus",
    `Found the following preprocessing services: ${preprocessingServiceList}`
  );

  res.status(HttpStatusCode.Ok).send({
    preprocessors: preprocessingServiceList
  })
}

export const preprocess = async (req: Request, res: Response) => {
  let epiId, preprocessors

  // Parse epiId and get it
  try {
    epiId = req.params.epiId;
  } catch (error) {
    res.send(HttpStatusCode.BadRequest).send({
      error: "Provide ePi Id in a path parameter."
    })
    return
  }

  // Get ePI
  let epi: any
  try {
    let epiResponse = await fhirEpiController.getEpiById(epiId)
    epi = epiResponse.data
  } catch (error: any) {
    if (error.statusCode === 404) {
      res.status(HttpStatusCode.NotFound).send(error)
    }
  }

  // Parse preprocessors
  preprocessors = req.query.preprocessors as string[];
  if (typeof preprocessors === "string") {
    // Express converts a single item array into a string, so we must convert again into array
    preprocessors = [preprocessors]
  } else if (typeof preprocessors === "undefined") {
    console.log("No preprocessor selected. Getting all of them");
    try {
      preprocessors = await queryPreprocessingServices() as string[]
    } catch (error) {
      console.error(error)
      res.status(HttpStatusCode.InternalServerError).send({
        error: "There was an error"
      })
      return
    }
  }

  console.log(`Requested ePI ID: ${epiId}`);
  console.log(`Requested preprocessors: ${preprocessors}`);

  // Call preprocessors


  preprocessors.forEach(async serviceName => {
    try {
      epi = await callPreprocessingService(serviceName, epi)
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.code === "ENOTFOUND") {
          console.log("PREPROCESSING SERVICE ADDRESS NOT FOUND");
        }
      }
    }
  });

  res.status(200).send(epi)
}
