import { IServiceClient } from "./IServiceClient";

export class ServiceClientFactory {
  private static k8sClient: IServiceClient | null = null;
  private static dockerClient: IServiceClient | null = null;
  private static nullClient: IServiceClient | null = null;

  static async getClient(): Promise<IServiceClient> {
    const environment = process.env.ENVIRONMENT;

    if (environment === "standalone") {
      // Lazy import only when needed
      if (!this.dockerClient) {
        const { DockerClient } = await import("./dockerClient");
        this.dockerClient = new DockerClient();
      }
      return this.dockerClient;
    } else if (environment === "none") {
      // No infrastructure: service discovery disabled.
      // Services must be configured via external endpoint environment variables
      // (PREPROCESSING_EXTERNAL_ENDPOINTS, LENSES_EXTERNAL_ENDPOINTS).
      if (!this.nullClient) {
        const { NullServiceClient } = await import("./nullServiceClient");
        this.nullClient = new NullServiceClient();
      }
      return this.nullClient;
    } else {
      if (!this.k8sClient) {
        const { k8sClient } = await import("./k8sClient");
        this.k8sClient = new k8sClient();
      }
      return this.k8sClient;
    }
  }
}
