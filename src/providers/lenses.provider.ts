import AxiosController from '../utils/axios';
import { getK8sServicesByLabel } from "../utils/k8sClient";
import { Logger } from "../utils/Logger";

const FOCUSING_LABEL_SELECTOR = process.env.FOCUSING_LABEL_SELECTOR || "";
const LEE_URL = process.env.LEE_URL || "";

export class LensesProvider extends AxiosController {
    constructor(baseUrl: string) {
        super(baseUrl);
    }

    getLenseNames = async () => {
        let lensesList: string[];
        try {
            lensesList = await this.queryFocusingServices() as string[]
        } catch (error) {
            console.error(error)
            throw error
        }
        Logger.logInfo("lensesController.ts", "getLenses",
            `Found the following lenses: ${lensesList}`
        );
        return lensesList

    }

    queryFocusingServices = async () => {
        return getK8sServicesByLabel(FOCUSING_LABEL_SELECTOR)
    }

    getLenseByName = async (serviceName: string[], epi: any) => {
        let url = `http://${serviceName}.default.svc.cluster.local/focus`;
        Logger.logInfo('lenses.provider.ts', 'getLenseByName', `Getting lense by name: ${url}`)
        try {
            let response = await this.request.post(url, epi)
            return response.data
        } catch (error) {
            Logger.logError('lenses.provider.ts', 'getLenseByName', `Error getting lense by name: ${url}`)
            throw error
        }
    }

    parseLenses = async (lenses: string[]) => {
        if (typeof lenses === "string") {
            // Express converts a single item array into a string, so we must convert again into array
            lenses = [lenses]
        } else if (typeof lenses === "undefined") {
            console.log("No lenses selected. Getting all of them");
            try {
                lenses = await this.getLenseNames() as string[]
            } catch (error) {
                console.error(error)
                throw error
            }
        }
        return lenses
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