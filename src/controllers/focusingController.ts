import axios, { HttpStatusCode } from "axios";
import { Response, Request } from "express";
import { getK8sServicesByLabel } from "../utils/k8sClient";
import { Logger } from "../utils/Logger";

const FOCUSING_LABEL_SELECTOR = process.env.FOCUSING_LABEL_SELECTOR || "";


export const focus = async (req: Request, res: Response) => {
  let epi = req.body;
  let preprocessingServiceList = (await getK8sServicesByLabel(FOCUSING_LABEL_SELECTOR).catch(
    console.error.bind(console)
  )) as string[];
  Logger.logInfo("focusingController.ts", "focus",
    `Found the following preprocessing services: ${preprocessingServiceList}`
  );
  /* preprocessingServiceList.forEach((preprocessingServiceName) => {
    epi = callPreprocessingService(preprocessingServiceName, epi);
  }); */
  res.status(200).send(epi);
};
