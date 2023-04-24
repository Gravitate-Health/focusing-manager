
import { getK8sServicesByLabel } from "../utils/k8sClient";
import { Logger } from "../utils/Logger";
import { getResourceById } from "../utils/fhirClient"
import axios, { HttpStatusCode } from "axios";
import { Response, Request } from "express";

const PREPROCESSING_LABEL_SELECTOR = process.env.PREPROCESSING_LABEL_SELECTOR || "";


async function callPreprocessingService(serviceName: string, epi: any) {
  let url = `http://${serviceName}.default.svc.cluster.local/preprocessing`;
  Logger.logInfo('focusing.ts', 'callPreprocessingService', `Querying preprocessing service: ${url}`)
  let response = await axios
    .post(url, epi)
    .then((response) => {
      return response.data;
    })
    .catch((error) => {
      Logger.logError('focusing.ts', 'callPreprocessingService', `Error querying preprocessing service: ${url}`)
      console.error(error)
      return
    });
}

export const preprocess = async (req: Request, res: Response) => {
  let resource = await getResourceById("epi", "7642")
  res.status(200).send(resource)
}
