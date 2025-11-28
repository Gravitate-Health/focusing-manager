
import { Logger } from "../utils/Logger";
import axios, { AxiosError, HttpStatusCode } from "axios";
import { Response, Request } from "express";
import { FhirEpiProvider } from "../providers/fhirEpi.provider";
import { PreprocessingProvider } from "../providers/preprocessing.provider";
import { readFileSync } from "fs";
import { Liquid } from "liquidjs";

const FHIR_BASE_URL = process.env.FHIR_EPI_URL as string;

let fhirEpiProvider = new FhirEpiProvider(FHIR_BASE_URL)
let preprocessingProvider = new PreprocessingProvider("")

export const getPreprocessingServices = async (_req: Request, res: Response) => {
  let preprocessingServiceList: string[];
  try {
    preprocessingServiceList = await preprocessingProvider.queryPreprocessingServices() as string[]
  } catch (error) {
    console.error(error)
    res.status(HttpStatusCode.InternalServerError).send({
      error: "There was an error"
    })
    return
  }
  Logger.logInfo("preprocessingController.ts", "getPreprocessingServices",
    `Found the following preprocessing services: ${preprocessingServiceList}`
  );

  res.status(HttpStatusCode.Ok).send({
    preprocessors: preprocessingServiceList
  })
}

export const preprocess = async (req: Request, res: Response) => {
  let epiId: string, preprocessors: string[] | undefined, epi: any
  let reqPreprocessors = req.query.preprocessors as string[]

  // Parse epiId and get it
  try {
    epiId = req.params.epiId;
  } catch (error) {
    res.status(HttpStatusCode.BadRequest).send({
      error: "Provide ePi Id in a path parameter."
    })
    return
  }

  // Get ePI
  try {
    let epiResponse = await fhirEpiProvider.getEpiById(epiId)
    epi = epiResponse.data
  } catch (error: any) {
    if (error.statusCode === 404) {
      res.status(HttpStatusCode.NotFound).send(error)
      return
    }
  }

  // Parse preprocessors
  try {
    preprocessors = await preprocessingProvider.parsePreprocessors(reqPreprocessors)
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).send({
      error: "There was an error"
    })
  }

  console.log(`Requested ePI ID: ${epiId}`);
  console.log(`Requested preprocessors: ${preprocessors}`);

  let preprocessedEpi, preprocessingErrors
  // Call preprocessors
  if (preprocessors) {
    [preprocessedEpi, preprocessingErrors] = await preprocessingProvider.callServicesFromList(preprocessors, epi)
  }

  if (req.accepts('html') == 'html') {

    try {
      const epiTemplate = readFileSync(`${process.cwd()}/templates/epi.liquid`, "utf-8")

      const engine = new Liquid()
      engine.parseAndRender(epiTemplate, preprocessedEpi)
        .then(html => {
          res.set('Content-Type', 'text/html').status(HttpStatusCode.Ok).send(html)
        });

    } catch (error) {
      console.log(error);
      res.status(HttpStatusCode.InternalServerError).send({
        message: "Error converting to html",
        reason: error
      })
    }
  }
  else {//Response with e(ePi)
    res.status(200).send(preprocessedEpi)
  }
}
