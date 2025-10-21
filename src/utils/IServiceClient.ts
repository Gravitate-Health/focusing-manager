export interface IServiceClient {
    /*
     Available service base URL that are tagged with a label.
     Thhis will be used to generate endpoints (i.e. adding the specific path to the base URL)
     Base URL will be something like http://${host}:${port}
     */
  getServiceBaseUrlsByLabel(label: string): Promise<string[]>;
}