import AxiosController from '../utils/axios';
import { ServiceClientFactory } from '../utils/ServiceClientFactory';
import { Logger } from "../utils/Logger";

const FOCUSING_LABEL_SELECTOR = process.env.FOCUSING_LABEL_SELECTOR || "eu.gravitate-health.fosps.focusing=True";

export class LensesProvider extends AxiosController {
    private lensSelectorMap: Record<string, string> = {}
    private lensIdentifierMap: Record<string, { selectorName: string, actualLensIdentifier: string }> = {}
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

            // Refresh identifier map for this selector: remove old entries for this selector
            try {
                for (const key of Object.keys(this.lensIdentifierMap)) {
                    if (this.lensIdentifierMap[key].selectorName === lensSelectorName) {
                        delete this.lensIdentifierMap[key]
                    }
                }

                const lensesList: string[] = response.data?.lenses || []
                for (const rawIdentifier of lensesList) {
                    let lensIdentifier = rawIdentifier
                    if (lensIdentifier.endsWith('.js')) {
                        lensIdentifier = lensIdentifier.slice(0, lensIdentifier.length - 3)
                    }

                    let key = lensIdentifier
                    if (!this.lensIdentifierMap[key]) {
                        this.lensIdentifierMap[key] = {
                            selectorName: lensSelectorName,
                            actualLensIdentifier: lensIdentifier
                        }
                    } else if (this.lensIdentifierMap[key].selectorName === lensSelectorName) {
                        // same selector and key already present - overwrite to be safe
                        this.lensIdentifierMap[key] = {
                            selectorName: lensSelectorName,
                            actualLensIdentifier: lensIdentifier
                        }
                    } else {
                        // Collision should be rare now that selectors return FHIR identifiers.
                        let newKey = `${lensIdentifier}`
                        let count = 2;
                        while (this.lensIdentifierMap[newKey]) {
                            newKey = `${lensIdentifier}${count ++}`
                        }
                        this.lensIdentifierMap[newKey] = {
                            selectorName: lensSelectorName,
                            actualLensIdentifier: lensIdentifier
                        }
                    }
                }
            } catch (err) {
                // Log but don't fail the main response
                Logger.logError('lenses.provider.ts', 'getLensSelectorAvailableLenses', `Error updating lensIdentifierMap for selector ${lensSelectorName}: ${err}`)
            }

            return response.data
        } catch (error) {
            Logger.logError('lenses.provider.ts', 'getLensSelectorAvailableLenses', `Error getting from selector: ${url}`)
            throw error
        }
    }

    getLensFromSelector = async (lensSelectorName: string, lensName: string) => {
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

    // Filter the identifier map with the requested lens identifiers.
    parseLenses = async (lensesToParse: string[] | string) => {
        let parsedLenses: any[] = []
        if (typeof lensesToParse === "string") {
            lensesToParse = lensesToParse
                .split(",")
                .map((lensIdentifier) => lensIdentifier.trim())
                .filter(Boolean)
        } else if (typeof lensesToParse === "undefined") {
            throw new Error("No lenses were selected.")
        }
        
        // Ensure identifier map is populated.
        await this.getAllAvailableLenses()

        // Find the lens identifier in the map to provide selector and actual identifier.
        lensesToParse.forEach((lensToParse: string) => {
            let lensInfo = this.lensIdentifierMap[lensToParse]
            if (lensInfo) {
                parsedLenses.push({
                    lensSelector: lensInfo.selectorName,
                    lensIdentifier: lensInfo.actualLensIdentifier
                })
            } else {
                Logger.logWarn('lenses.provider.ts', 'parseLenses', `Lens not found: ${lensToParse}`)
            }       
        })
        return parsedLenses
    }

    getCompleteLenses = async (parsedLenses: Array<{ lensSelector: string, lensIdentifier: string }>) => {
        const completeLenses: any[] = []
        const errors: Array<{ lensIdentifier: string, error: string }> = []

        for (const lensObj of parsedLenses) {
            try {
                const lens = await this.getLensFromSelector(lensObj.lensSelector, lensObj.lensIdentifier)
                completeLenses.push(lens)
                Logger.logInfo('lenses.provider.ts', 'getCompleteLenses', 
                    `Retrieved lens: ${lensObj.lensIdentifier} from selector: ${lensObj.lensSelector}`)
            } catch (error: any) {
                const errorMsg = error?.message || String(error)
                Logger.logError('lenses.provider.ts', 'getCompleteLenses', 
                    `Failed to retrieve lens: ${lensObj.lensIdentifier} from selector: ${lensObj.lensSelector}. Error: ${errorMsg}`)
                errors.push({ lensIdentifier: `${lensObj.lensSelector}/${lensObj.lensIdentifier}`, error: errorMsg })
            }
        }

        return { completeLenses, errors }
    }

    getAllAvailableLenses = async (): Promise<string[]> => {
        // Ensure identifier map is populated by querying all selectors.
        const lensSelectorList = await this.getLensSelectors()
        
        // Clean up stale entries - remove lenses from selectors that no longer exist
        const validSelectors = new Set(lensSelectorList)
        for (const key of Object.keys(this.lensIdentifierMap)) {
            const lensInfo = this.lensIdentifierMap[key]
            if (!validSelectors.has(lensInfo.selectorName)) {
                Logger.logDebug('lenses.provider.ts', 'getAllAvailableLenses',
                    `Removing stale lens entry: ${key} (selector ${lensInfo.selectorName} no longer exists)`
                )
                delete this.lensIdentifierMap[key]
            }
        }
        
        for (const lensSelectorName of lensSelectorList) {
            try {
                await this.getLensSelectorAvailableLenses(lensSelectorName)
            } catch (error: any) {
                Logger.logWarn('lenses.provider.ts', 'getAllAvailableLenses',
                    `Failed to get lenses from selector ${lensSelectorName}: ${error?.message || error}`
                )
            }
        }
        
        return Object.keys(this.lensIdentifierMap)
    }
}