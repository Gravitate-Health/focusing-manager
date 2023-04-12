//import { HttpStatusCode } from "axios";
import { Response, Request } from "express";
import { coreV1Api } from "../utils/k8sClient";

async function getServices() {
  const services = await coreV1Api.listNamespacedService("default");
  let serviceList: string[] = [];
  for (const service of services.body.items) {
    let serviceName = service.metadata!.name as string;
    serviceList.push(serviceName);
  }
  return serviceList;
}

export const focus = async (_req: Request, res: Response) => {
  let serviceList = await getServices().catch(console.error.bind(console));
  res.status(200).send(serviceList);
};
