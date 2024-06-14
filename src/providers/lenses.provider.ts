import { parse } from 'dotenv';
import AxiosController from '../utils/axios';
import { getK8sServicesByLabel } from "../utils/k8sClient";
import { Logger } from "../utils/Logger";

const FOCUSING_LABEL_SELECTOR = process.env.FOCUSING_LABEL_SELECTOR || "";
const LEE_URL = process.env.LEE_URL || "";

export class LensesProvider extends AxiosController {
    constructor(baseUrl: string) {
        super(baseUrl);
    }

    getLensSelectors = async () => {
        let lensSelectorList: string[];
        try {
            lensSelectorList = await this.queryFocusingServices() as string[]
        } catch (error) {
            console.error(error)
            throw error
        }
        Logger.logInfo("lensesController.ts", "getLenses",
            `Found the following lenses: ${lensSelectorList}`
        );
        return lensSelectorList
    }

    getLensSelectorAvailableLenses = async (lensSelectorName: string) => {
        let lensesList: string[] = []
        let url = `http://${lensSelectorName}.default.svc.cluster.local:3000/lenses`;
        Logger.logInfo('lenses.provider.ts', 'getLenseSelectorAvailableLenses', `Getting lenses from selector: ${url}`)
        try {
            let response = await this.request.get(url)
            return response.data
        } catch (error) {
            Logger.logError('lenses.provider.ts', 'getLenseSelectorAvailableLenses', `Error getting from selector: ${url}`)
            throw error
        }
    }

    getLensFromSelector = async (lensSelectorName: string, lensName: string) => {
        let lensesList: string[] = []
        let lensCompleteName = `${lensName}`
        let url = `http://${lensSelectorName}.default.svc.cluster.local:3000/lenses/${lensCompleteName}`;
        Logger.logInfo('lenses.provider.ts', 'getLenseSelectorAvailableLenses', `Getting lenses from selector: ${url}`)
        try {
            let response = await this.request.get(url)
            return response.data
        } catch (error) {
            Logger.logError('lenses.provider.ts', 'getLenseSelectorAvailableLenses', `Error getting from selector: ${url}`)
            throw error
        }
    }

    queryFocusingServices = async () => {
        return getK8sServicesByLabel(FOCUSING_LABEL_SELECTOR)
    }

    splitLensIntoParts = (lensToSplit: string) => {
        let splitLens = lensToSplit.split("_")
        if (splitLens.length === 2) {
            return {
                lensSelector: splitLens[0],
                lensName: splitLens[1]
            }
        } else {
            return {
                lensSelector: "lens-selector-mvp2",
                lensName: splitLens[0]
            }
        }
    }

    parseLenses = async (lensesToParse: string[] | string) => {
        if (typeof lensesToParse === "string") {
            // Express converts a single item of a query param array into a string, so we must convert again into array
            return [this.splitLensIntoParts(lensesToParse)]
        } else if (lensesToParse instanceof Array) {
            let parsedLenses: any[] = []
            lensesToParse.forEach(lensToParse => {
                parsedLenses.push(this.splitLensIntoParts(lensToParse))
            })
            return parsedLenses
        } else {
            throw new Error("No lenses were selected.")
        }
    }

    callLensExecutionEnvironment = async (lense: any, epi: any) => {
        let response;
        let url = `${LEE_URL}/focus`;
        Logger.logInfo('lenses.provider.ts', 'callLensExecutionEnvironment', `Calling LEE: ${url}`)
        try {
            response = await this.request.post(url, epi)
            return response.data
        } catch (error) {
            Logger.logError('lenses.provider.ts', 'callLensExecutionEnvironment', `Error calling LEE: ${url}`)
            throw error
        }
    }
}