import { IServiceClient } from "./IServiceClient";

export class ServiceClientFactory {
  private static k8sClient: IServiceClient | null = null;
  private static dockerClient: IServiceClient | null = null;

  static async getClient(): Promise<IServiceClient> {
    const useDockerClient = process.env.ENVIRONMENT === "standalone";

    if (useDockerClient) {
      // Lazy import only when needed
      if (!this.dockerClient) {
        const { DockerClient } = await import("./dockerClient");
        this.dockerClient = new DockerClient();
      }
      return this.dockerClient;
    } else {
      if (!this.k8sClient) {
        const { k8sClient } = await import("./k8sClient");
        this.k8sClient = new k8sClient();
      }
      return this.k8sClient;
    }
  }
}
