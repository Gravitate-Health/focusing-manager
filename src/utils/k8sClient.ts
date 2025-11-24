import * as k8s from "@kubernetes/client-node";
import * as fs from 'fs';
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

function resolveNamespace(): string {
  // 1) common env vars set by runners / manifests
  const fromEnv = process.env.NAMESPACE || process.env.POD_NAMESPACE || process.env.K8S_NAMESPACE;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  // 2) in-cluster token namespace file
  try {
    const nsFile = '/var/run/secrets/kubernetes.io/serviceaccount/namespace';
    if (fs.existsSync(nsFile)) {
      const data = fs.readFileSync(nsFile, 'utf8').trim();
      if (data) return data;
    }
  } catch {
    // ignore
  }

  // 3) kubeconfig current-context namespace (if present)
  try {
    const current = kc.getCurrentContext();
    const ctx = (kc as any).contexts?.find((c: any) => c.name === current);
    const ns = ctx?.context?.namespace;
    if (ns && ns.trim()) return ns.trim();
  } catch {
    // ignore
  }

  // fallback
  return 'default';
}

export class k8sClient implements IServiceClient {
  async getServiceBaseUrlsByLabel(labelSelector: string): Promise<string[]> {
    try {
      const namespace = resolveNamespace();

      // use the generated request-object overload
      const req: k8s.CoreV1ApiListNamespacedServiceRequest = {
        namespace,
        labelSelector,
      };

      const services = await coreV1Api.listNamespacedService(req);

      const serviceList: string[] = [];
      for (const service of services.items) {
        const serviceName = service.metadata!.name as string;
        const serviceNamespace = service.metadata?.namespace ?? namespace;
        const servicePort = (service.spec?.ports?.[0]?.port ?? '').toString();
        if (serviceName && servicePort) {
          serviceList.push(`http://${serviceName}.${serviceNamespace}.svc.cluster.local:${servicePort}`);
        }
      }
      return serviceList;
    } catch (err: any) {
      console.error('[k8sClient] Error listing services:', err?.message ?? err);
      return [];
    }
  }
}