import { AxiosError } from 'axios';
import AxiosController from '../utils/axios';
import { Logger } from '../utils/Logger';
import { ServiceClientFactory } from '../utils/ServiceClientFactory';
import { CacheFactory } from './cache/CacheFactory';
import { IPreprocessingCache, PipelineStep } from './cache/IPreprocessingCache';
import { generateEpiKey, pipelineToSignature } from './cache/utils';

const PREPROCESSING_LABEL_SELECTOR = process.env.PREPROCESSING_LABEL_SELECTOR || "eu.gravitate-health.fosps.preprocessing=True";
const PREPROCESSING_EXTERNAL_ENDPOINTS = process.env.PREPROCESSING_EXTERNAL_ENDPOINTS || ""; // Comma-separated list of URLs
const PREPROCESSING_TIMEOUT = parseInt(process.env.PREPROCESSING_TIMEOUT || "20000", 10); // Timeout in milliseconds (default: 20 seconds)

export class PreprocessingProvider extends AxiosController {
    private serviceMap: Map<string, string> = new Map(); // Maps service name to URL
    private isRefreshing: boolean = false; // Prevent concurrent refreshes
    private refreshPromise: Promise<string[]> | null = null; // Share refresh promise
    private cache: IPreprocessingCache;

    constructor(baseUrl: string) {
        super(baseUrl);
        this.cache = CacheFactory.getCache();
        Logger.logInfo('preprocessing.provider.ts', 'constructor', 
            `Initialized with cache backend: ${this.cache.getName()}`);
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
            // Extract just the first part of the hostname as the service name
            return urlObj.hostname.split('.')[0];
        } catch (error) {
            Logger.logWarn("preprocessing.provider.ts", "extractServiceName", `Could not parse URL: ${url}`);
            return url;
        }
    }

    private parseExternalEndpoints = (): string[] => {
        if (!PREPROCESSING_EXTERNAL_ENDPOINTS || PREPROCESSING_EXTERNAL_ENDPOINTS.trim() === "") {
            return [];
        }

        const endpoints = PREPROCESSING_EXTERNAL_ENDPOINTS.split(',')
            .map(url => url.trim())
            .filter(url => url.length > 0);

        Logger.logDebug("preprocessing.provider.ts", "parseExternalEndpoints", 
            `Found ${endpoints.length} external preprocessor endpoint(s) in ENV`);

        return endpoints;
    }

    queryPreprocessingServices = async (): Promise<string[]> => {
        // If already refreshing, wait for that operation to complete
        if (this.isRefreshing && this.refreshPromise) {
            Logger.logDebug("preprocessing.provider.ts", "queryPreprocessingServices", 
                "Refresh already in progress, waiting...");
            return this.refreshPromise;
        }
        
        // Mark as refreshing and create promise
        this.isRefreshing = true;
        this.refreshPromise = this._performRefresh();
        
        try {
            const result = await this.refreshPromise;
            return result;
        } finally {
            this.isRefreshing = false;
            this.refreshPromise = null;
        }
    }

    private _performRefresh = async (): Promise<string[]> => {
        // Get discovered services
        const discoveredUrls = await (await ServiceClientFactory.getClient()).getServiceBaseUrlsByLabel(PREPROCESSING_LABEL_SELECTOR);
        
        // Get external endpoints from ENV
        const externalUrls = this.parseExternalEndpoints();
        
        // Combine both sources
        const allServiceUrls = [...discoveredUrls, ...externalUrls];
        
        Logger.logDebug("preprocessing.provider.ts", "_performRefresh", 
            `Total services: ${allServiceUrls.length} (${discoveredUrls.length} discovered, ${externalUrls.length} external)`);
        
        // Build new map atomically before replacing
        const newServiceMap = new Map<string, string>();
        const serviceNames: string[] = [];

        for (const url of allServiceUrls) {
            const baseName = this.extractServiceName(url);
            
            // Check if this name already exists
            let count = 1;
            while (newServiceMap.has(count > 1 ? `${baseName}-${count}` : baseName)) {
                count++;
            }
            
            // Generate unique name (add number suffix if duplicate)
            const uniqueName = count > 1 ? `${baseName}-${count}` : baseName;
            
            // Store mapping in new map
            newServiceMap.set(uniqueName, url);
            serviceNames.push(uniqueName);
            
            Logger.logDebug("preprocessing.provider.ts", "_performRefresh", 
                `Registered preprocessing service: ${uniqueName} -> ${url}`);
        }

        // Atomic replacement of the service map
        this.serviceMap = newServiceMap;

        return serviceNames;
    }

    private getServiceUrl = (serviceName: string): string | undefined => {
        return this.serviceMap.get(serviceName);
    }

    callPreprocessingService = async (serviceName: string, epi: any) => {
        let serviceUrl = this.getServiceUrl(serviceName);
        
        // If service not found in map, try to refresh the registry
        if (!serviceUrl) {
            Logger.logWarn('preprocessing.provider.ts', 'callPreprocessingService', 
                `Service name not found in registry: ${serviceName}. Refreshing service registry...`);
            
            try {
                await this.queryPreprocessingServices();
                serviceUrl = this.getServiceUrl(serviceName);
                
                if (!serviceUrl) {
                    Logger.logError('preprocessing.provider.ts', 'callPreprocessingService', 
                        `Service name still not found after refresh: ${serviceName}`);
                    throw new Error(`Unknown preprocessing service: ${serviceName}`);
                }
            } catch (error) {
                Logger.logError('preprocessing.provider.ts', 'callPreprocessingService', 
                    `Failed to refresh service registry: ${error}`);
                throw new Error(`Unknown preprocessing service: ${serviceName}`);
            }
        }
        
        const url = `${serviceUrl}/preprocess`;
        Logger.logInfo('preprocessing.provider.ts', 'callPreprocessingService', 
            `Calling preprocessing service: ${serviceName} at ${url}`);
        
        try {
            let response = await this.request.post(url, epi, {
                timeout: PREPROCESSING_TIMEOUT
            });
            this.setCategoryCode(epi, "P");
            return response.data
        } catch (error) {
            Logger.logError('preprocessing.provider.ts', 'callPreprocessingService', 
                `Error calling preprocessing service ${serviceName} at ${url}`);
            throw error
        }
    }

    callServicesFromList = async (preprocessors: string[], epi: any): Promise<[any, object[]]> => {
        let errors: object[] = []
        
        try {
            // Generate cache key for the source ePI
            const epiKey = generateEpiKey(epi);
            
            // Build pipeline steps from preprocessor names
            const pipelineSteps: PipelineStep[] = preprocessors.map(name => ({ name }));
            
            Logger.logDebug('preprocessing.provider.ts', 'callServicesFromList', 
                `Pipeline: ${pipelineToSignature(pipelineSteps)}`);
            
            // Try to get cached result for longest matching prefix
            const cacheHit = await this.cache.get(epiKey, pipelineSteps);
            
            let startIndex = 0;
            if (cacheHit && cacheHit.matchedSteps > 0) {
                epi = cacheHit.value;
                startIndex = cacheHit.matchedSteps;
                
                Logger.logInfo('preprocessing.provider.ts', 'callServicesFromList', 
                    `Cache hit: skipping first ${startIndex}/${preprocessors.length} preprocessors`);
            }
            
            // Process remaining preprocessors
            for (let i = startIndex; i < preprocessors.length; i++) {
                let serviceName = preprocessors[i];
                try {
                    epi = await this.callPreprocessingService(serviceName, epi);
                    Logger.logInfo('preprocessing.provider.ts', 'callServicesFromList', 
                        `Successfully called preprocessing service: ${serviceName}`);
                    
                    // Cache the result after each successful preprocessing step
                    const stepsUpToNow = pipelineSteps.slice(0, i + 1);
                    await this.cache.set(epiKey, stepsUpToNow, epi);
                    
                    Logger.logDebug('preprocessing.provider.ts', 'callServicesFromList', 
                        `Cached result after step ${i + 1}/${preprocessors.length}`);
                    
                } catch (error) {
                    if (error instanceof AxiosError) {
                        if (error.code === "ENOTFOUND") {
                            Logger.logError('preprocessing.provider.ts', 'callServicesFromList', 
                                `Preprocessing service not found: ${serviceName}`);
                            errors.push({ serviceName: serviceName, error: "Service not found" })
                        } else if (error.code === "ECONNABORTED") {
                            Logger.logError('preprocessing.provider.ts', 'callServicesFromList', 
                                `Preprocessing service timeout: ${serviceName}`);
                            errors.push({ serviceName: serviceName, error: "Request timeout" })
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
            
            // Log cache statistics
            const stats = this.cache.getStats();
            Logger.logInfo('preprocessing.provider.ts', 'callServicesFromList', 
                `Cache stats - hits: ${stats.hits}, partial: ${stats.partialHits}, misses: ${stats.misses}, sets: ${stats.sets}, errors: ${stats.errors}`);
            
        } catch (cacheError) {
            Logger.logError('preprocessing.provider.ts', 'callServicesFromList', 
                `Cache error (falling back to normal processing): ${cacheError}`);
            
            // Fallback: process all preprocessors without cache
            for (let i = 0; i < preprocessors.length; i++) {
                let serviceName = preprocessors[i];
                try {
                    epi = await this.callPreprocessingService(serviceName, epi);
                    Logger.logInfo('preprocessing.provider.ts', 'callServicesFromList', 
                        `Successfully called preprocessing service: ${serviceName}`);
                } catch (error) {
                    if (error instanceof AxiosError) {
                        if (error.code === "ENOTFOUND") {
                            errors.push({ serviceName: serviceName, error: "Service not found" })
                        } else {
                            errors.push({ serviceName: serviceName, error: error.message })
                        }
                    } else if (error instanceof Error) {
                        errors.push({ serviceName: serviceName, error: error.message })
                    } else {
                        errors.push({ serviceName: serviceName, error: "Unknown error" })
                    }
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

    // Public method to get cache statistics
    getCacheStats = () => {
        return this.cache.getStats();
    }

    // Public method to clear the cache
    clearCache = async (): Promise<void> => {
        await this.cache.clear();
        Logger.logInfo('preprocessing.provider.ts', 'clearCache', 'Cache cleared');
    }

    // Public method to invalidate cache for a specific ePI
    invalidateEpiCache = async (epi: any): Promise<void> => {
        const epiKey = generateEpiKey(epi);
        await this.cache.invalidateByEpi(epiKey);
        Logger.logInfo('preprocessing.provider.ts', 'invalidateEpiCache', 
            `Invalidated cache for ePI ${epiKey.substring(0, 8)}...`);
    }

    setCategoryCode(epi: any, code: string): any {
        const composition = this.findResourceByType(epi, "Composition");
        if (!composition) {
            Logger.logWarn("lensesController.ts", "setCategoryCode", "Composition resource not found");
            return;
        }
        
        try {
            if (!composition.category) {
                composition.category = [];
            }
            if (!composition.category[0]) {
                composition.category[0] = { coding: [] };
            }
            if (!composition.category[0].coding) {
                composition.category[0].coding = [];
            }
            if (!composition.category[0].coding[0]) {
                composition.category[0].coding[0] = {};
            }
            composition.category[0].coding[0].code = code;
        } catch (error) {
            Logger.logWarn("lensesController.ts", "setCategoryCode", "Could not set category code");
        }
    }

    // Helper function to find a resource by type - handles both bundles and direct resources
    findResourceByType(resource: any, resourceType: string): any {
        if (!resource) {
            return null;
        }
        
        // If it's the resource we're looking for, return it
        if (resource.resourceType === resourceType) {
            return resource;
        }
        
        // If it's a Bundle, search in entries
        if (resource.resourceType === "Bundle" && resource.entry && Array.isArray(resource.entry)) {
            const entry = resource.entry.find((e: any) => 
                e.resource && e.resource.resourceType === resourceType
            );
            return entry ? entry.resource : null;
        }
        
        // Resource not found
        return null;
    }
}
