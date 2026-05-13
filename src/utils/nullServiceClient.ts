import { IServiceClient } from "./IServiceClient";

/**
 * A no-op IServiceClient implementation for environments without
 * Kubernetes or Docker infrastructure (e.g. bare-metal VMs, local Node.js).
 *
 * Service discovery is disabled: all label queries return an empty array.
 * Services must be configured via external endpoint environment variables:
 *   - PREPROCESSING_EXTERNAL_ENDPOINTS for preprocessor services
 *   - LENSES_EXTERNAL_ENDPOINTS for lens selector services
 *
 * Activated by setting ENVIRONMENT=none.
 */
export class NullServiceClient implements IServiceClient {
    async getServiceBaseUrlsByLabel(_label: string): Promise<string[]> {
        return [];
    }
}
