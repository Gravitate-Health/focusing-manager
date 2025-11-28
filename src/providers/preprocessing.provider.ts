import { AxiosError } from 'axios';
import AxiosController from '../utils/axios';
import { Logger } from '../utils/Logger';
import { ServiceClientFactory } from '../utils/ServiceClientFactory';

const PREPROCESSING_LABEL_SELECTOR = process.env.PREPROCESSING_LABEL_SELECTOR || "";

export class PreprocessingProvider extends AxiosController {
    private serviceMap: Map<string, string> = new Map(); // Maps service name to URL

    constructor(baseUrl: string) {
        super(baseUrl);
    }

    parsePreprocessors = async (preprocessors: string[]) => {
        if (typeof preprocessors === "string") {
            // Express converts a single item array into a string, so we must convert again into array
            preprocessors = [preprocessors]
        } else if (typeof preprocessors === "undefined") {
            Logger.logDebug("preprocessing.provider.ts", "parsePreprocessors", "No preprocessor selected. Getting all of them");
            try {
                preprocessors = await this.queryPreprocessingServices() as string[]
            } catch (error) {
                Logger.logError("preprocessing.provider.ts", "parsePreprocessors", "Error querying preprocessing services");
                throw error
            }
        }
        return preprocessors
    }

    private extractServiceName = (url: string): string => {
        try {
            const urlObj = new URL(url);
            // Extract hostname (domain name) without port
            return urlObj.hostname;
        } catch (error) {
            Logger.logWarn("preprocessing.provider.ts", "extractServiceName", `Could not parse URL: ${url}`);
            return url;
        }
    }

    queryPreprocessingServices = async (): Promise<string[]> => {
        const serviceUrls = await (await ServiceClientFactory.getClient()).getServiceBaseUrlsByLabel(PREPROCESSING_LABEL_SELECTOR);
        
        // Clear existing map
        this.serviceMap.clear();
        
        const serviceNames: string[] = [];

        for (const url of serviceUrls) {
            const baseName = this.extractServiceName(url);
            
            // Check if this name already exists
            let count =  1;
            while (this.serviceMap.has(count > 1 ? `${baseName}-${count}` : baseName)) {
                count++;
            }
            
            // Generate unique name (add number suffix if duplicate)
            const uniqueName = count > 1 ? `${baseName}-${count}` : baseName;
            
            // Store mapping
            this.serviceMap.set(uniqueName, url);
            serviceNames.push(uniqueName);
            
            Logger.logDebug("preprocessing.provider.ts", "queryPreprocessingServices", 
                `Registered preprocessing service: ${uniqueName} -> ${url}`);
        }

        return serviceNames;
    }

    private getServiceUrl = (serviceName: string): string | undefined => {
        return this.serviceMap.get(serviceName);
    }

    callPreprocessingService = async (serviceName: string, epi: any) => {
        const serviceUrl = this.getServiceUrl(serviceName);
        
        if (!serviceUrl) {
            Logger.logError('preprocessing.provider.ts', 'callPreprocessingService', 
                `Service name not found in registry: ${serviceName}`);
            throw new Error(`Unknown preprocessing service: ${serviceName}`);
        }
        
        const url = `${serviceUrl}/preprocess`;
        Logger.logInfo('preprocessing.provider.ts', 'callPreprocessingService', 
            `Calling preprocessing service: ${serviceName} at ${url}`);
        
        try {
            let response = await this.request.post(url, epi)
            return response.data
        } catch (error) {
            Logger.logError('preprocessing.provider.ts', 'callPreprocessingService', 
                `Error calling preprocessing service ${serviceName} at ${url}`);
            throw error
        }
    }

    callServicesFromList = async (preprocessors: string[], epi: any): Promise<[any, object[]]> => {
        let errors: object[] = []
        
        for (let i in preprocessors) {
            let serviceName = preprocessors[i]
            try {
                epi = await this.callPreprocessingService(serviceName, epi)
                Logger.logInfo('preprocessing.provider.ts', 'callServicesFromList', 
                    `Successfully called preprocessing service: ${serviceName}`);
            } catch (error) {
                if (error instanceof AxiosError) {
                    if (error.code === "ENOTFOUND") {
                        Logger.logError('preprocessing.provider.ts', 'callServicesFromList', 
                            `Preprocessing service not found: ${serviceName}`);
                        errors.push({ serviceName: serviceName, error: "Service not found" })
                    } else {
                        Logger.logError('preprocessing.provider.ts', 'callServicesFromList', 
                            `Error calling preprocessing service ${serviceName}: ${error.message}`);
                        errors.push({ serviceName: serviceName, error: error.message })
                    }
                } else if (error instanceof Error) {
                    Logger.logError('preprocessing.provider.ts', 'callServicesFromList', 
                        `Error calling preprocessing service ${serviceName}: ${error.message}`);
                    errors.push({ serviceName: serviceName, error: error.message })
                } else {
                    Logger.logError('preprocessing.provider.ts', 'callServicesFromList', 
                        `Unknown error calling preprocessing service ${serviceName}`);
                    errors.push({ serviceName: serviceName, error: "Unknown error" })
                }
            }
        }
        
        return [epi, errors]
    }

    // Public method to get all registered service names (useful for debugging)
    getRegisteredServices = (): string[] => {
        return Array.from(this.serviceMap.keys());
    }

    // Public method to check if a service is registered
    isServiceRegistered = (serviceName: string): boolean => {
        return this.serviceMap.has(serviceName);
    }
}