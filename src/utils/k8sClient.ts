import * as k8s from "@kubernetes/client-node";
import { IServiceClient } from './IServiceClient';


let environment = process.env.ENVIRONMENT;
console.log(`Connecting to k8s cluster in ${environment} mode`);

const kc = new k8s.KubeConfig();

if (environment === "dev") {
  let cluster = {
    name: process.env.CLUSTER_NAME,
    server: process.env.CLUSTER_SERVER,
    caData: process.env.CLUSTER_CADATA,
  };
  let user = {
    name: process.env.USER_NAME,
    token: process.env.USER_TOKEN,
  };
  let context = {
    name: process.env.CONTEXT_NAME,
    user: user.name,
    cluster: cluster.name,
  };
  kc.loadFromOptions({
    clusters: [cluster],
    users: [user],
    contexts: [context],
    currentContext: context.name,
  });
} else {
  kc.loadFromCluster();
}

const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);

export class k8sClient implements IServiceClient {
async getServiceBaseUrlsByLabel(labelSelector: string): Promise<string[]> {
  const services = await coreV1Api.listNamespacedService(
    "default",
    undefined,
    false,
    undefined,
    undefined,
    labelSelector
  );
  let serviceList: string[] = [];
  for (const service of services.body.items) {
    let serviceName = service.metadata!.name as string;
    let serviceNamespace = service.metadata?.namespace ?? "default"; // fallback if not set
    let servicePort = service.spec!.ports?.[0]?.port as string
    if (serviceName && servicePort) {
      serviceList.push(`http://${serviceName}.${serviceNamespace}.svc.cluster.local:${servicePort}`);
  }
  return serviceList;
}
}