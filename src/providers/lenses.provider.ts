import { parse } from 'dotenv';
import AxiosController from '../utils/axios.js';
import { ServiceClientFactory } from '../utils/ServiceClientFactory.js';
import { Logger } from "../utils/Logger.js";

const FOCUSING_LABEL_SELECTOR = process.env.FOCUSING_LABEL_SELECTOR || "eu.gravitate-health.fosps.focusing=True";
const LEE_URL = process.env.LEE_URL || "";

export class LensesProvider extends AxiosController {
    private lensSelectorMap: Record<string, string> = {}
    private lensNameMap: Record<string, { selectorName: string, actualLensName: string }> = {}
    private isRefreshing: boolean = false; // Prevent concurrent refreshes
    private refreshPromise: Promise<Record<string, string>> | null = null; // Share refresh promise

    constructor(baseUrl: string) {
        super(baseUrl);
    }

    getLensSelectors = async () => {
        try {
            const map = await this.queryFocusingServices()
            const lensSelectorList = Object.keys(map)
            Logger.logInfo("lensesController.ts", "getLenses",
                `Found the following lens selectors: ${lensSelectorList}`
            );
            return lensSelectorList
        } catch (error) {
            console.error(error)
            throw error
        }
    }

    getLensSelectorAvailableLenses = async (lensSelectorName: string) => {
        let baseUrl = this.lensSelectorMap[lensSelectorName]
        if (!baseUrl) {
            Logger.logWarn('lenses.provider.ts', 'getLensSelectorAvailableLenses', 
                `Lens selector not found: ${lensSelectorName}. Refreshing service registry...`)
            
            try {
                await this.queryFocusingServices();
                baseUrl = this.lensSelectorMap[lensSelectorName];
                
                if (!baseUrl) {
                    const msg = `Lens selector still not found after refresh: ${lensSelectorName}`
                    Logger.logError('lenses.provider.ts', 'getLensSelectorAvailableLenses', msg)
                    throw new Error(msg)
                }
            } catch (error) {
                Logger.logError('lenses.provider.ts', 'getLensSelectorAvailableLenses', 
                    `Failed to refresh service registry: ${error}`)
                throw new Error(`Lens selector not found: ${lensSelectorName}`)
            }
        }
        const url = `${baseUrl}/lenses`
        Logger.logInfo('lenses.provider.ts', 'getLensSelectorAvailableLenses', `Getting lenses from selector: ${url}`)
        try {
            let response = await this.request.get(url)

            // Refresh lensNameMap for this selector: remove old entries for this selector
            try {
                for (const key of Object.keys(this.lensNameMap)) {
                    if (this.lensNameMap[key].selectorName === lensSelectorName) {
                        delete this.lensNameMap[key]
                    }
                }

                const lensesList: string[] = response.data?.lenses || []
                for (const rawLens of lensesList) {
                    let lens = rawLens
                    if (lens.endsWith('.js')) {
                        lens = lens.slice(0, lens.length - 3)
                    }

                    let key = lens
                    if (!this.lensNameMap[key]) {
                        this.lensNameMap[key] = { selectorName: lensSelectorName, actualLensName: lens }
                    } else if (this.lensNameMap[key].selectorName === lensSelectorName) {
                        // same selector and key already present - overwrite to be safe
                        this.lensNameMap[key] = { selectorName: lensSelectorName, actualLensName: lens }
                    } else {
                        // collision with another selector: create unique key
                        let newKey = `${lens}`
                        let count = 2;
                        // ensure uniqueness (in rare case length key exists)
                        while (this.lensNameMap[newKey]) {
                            newKey = `${lens}${count ++}`
                        }
                        this.lensNameMap[newKey] = { selectorName: lensSelectorName, actualLensName: lens }
                    }
                }
            } catch (err) {
                // Log but don't fail the main response
                Logger.logError('lenses.provider.ts', 'getLensSelectorAvailableLenses', `Error updating lensNameMap for selector ${lensSelectorName}: ${err}`)
            }

            return response.data
        } catch (error) {
            Logger.logError('lenses.provider.ts', 'getLensSelectorAvailableLenses', `Error getting from selector: ${url}`)
            throw error
        }
    }

    getLensFromSelector = async (lensSelectorName: string, lensName: string) => {
        let lensesList: string[] = []
        let lensCompleteName = `${lensName}`
        let baseUrl = this.lensSelectorMap[lensSelectorName]
        if (!baseUrl) {
            Logger.logWarn('lenses.provider.ts', 'getLensFromSelector', 
                `Lens selector not found: ${lensSelectorName}. Refreshing service registry...`)
            
            try {
                await this.queryFocusingServices();
                baseUrl = this.lensSelectorMap[lensSelectorName];
                
                if (!baseUrl) {
                    const msg = `Lens selector still not found after refresh: ${lensSelectorName}`
                    Logger.logError('lenses.provider.ts', 'getLensFromSelector', msg)
                    throw new Error(msg)
                }
            } catch (error) {
                Logger.logError('lenses.provider.ts', 'getLensFromSelector', 
                    `Failed to refresh service registry: ${error}`)
                throw new Error(`Lens selector not found: ${lensSelectorName}`)
            }
        }
        let url = `${baseUrl}/lenses/${lensCompleteName}`;
        Logger.logInfo('lenses.provider.ts', 'getLensSelectorAvailableLenses', `Getting lens from selector: ${url}`)
        try {
            let response = await this.request.get(url)
            return response.data
        } catch (error) {
            Logger.logError('lenses.provider.ts', 'getLensSelectorAvailableLenses', `Error getting from selector: ${url}`)
            throw error
        }
    }

    queryFocusingServices = async () => {
        // If already refreshing, wait for that operation to complete
        if (this.isRefreshing && this.refreshPromise) {
            Logger.logDebug("lenses.provider.ts", "queryFocusingServices", 
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

    private _performRefresh = async (): Promise<Record<string, string>> => {
        const services = await (await ServiceClientFactory.getClient()).getServiceBaseUrlsByLabel(FOCUSING_LABEL_SELECTOR)
        const newMap: Record<string, string> = {}
        if (services && services instanceof Array) {
            services.forEach((s: string) => {
                try {
                    const parsed = new URL(s)
                    const domain = parsed.hostname
                    newMap[domain] = s
                } catch (err) {
                    // fallback: strip protocol and path
                    const domain = (s || '').replace(/(^\w+:|^)\/\//, '').split('/')[0]
                    newMap[domain] = s
                }
            })
        }
        // Atomic replacement of the selector map
        this.lensSelectorMap = newMap
        return newMap
    }

    // filter lensNameMap with given lenses
    parseLenses = async (lensesToParse: string[] | string) => {
        let parsedLenses: any[] = []
        if (typeof lensesToParse === "string") {
            // Express converts a single item array into a string, so we must convert again into array
            lensesToParse = [lensesToParse]
        } else if (typeof lensesToParse === "undefined") {
            throw new Error("No lenses were selected.")
        }
        lensesToParse.forEach((lensToParse: string) => {
            let lensInfo = this.lensNameMap[lensToParse]
            if (lensInfo) {
                parsedLenses.push({
                    lensSelector: lensInfo.selectorName,
                    lensName: lensInfo.actualLensName
                })
            } else {
                console.warn(`Lens not found: ${lensToParse}`)
            }       
        })
        return parsedLenses
    }
}