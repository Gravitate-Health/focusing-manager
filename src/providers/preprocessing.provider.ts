import { AxiosError } from 'axios';
import AxiosController from '../utils/axios';
import { Logger } from '../utils/Logger';
import { getK8sServicesByLabel } from '../utils/k8sClient';

const PREPROCESSING_LABEL_SELECTOR = process.env.PREPROCESSING_LABEL_SELECTOR || "";

export class PreprocessingProvider extends AxiosController {
    constructor(baseUrl: string) {
        super(baseUrl);
    }

    parsePreprocessors = async (preprocessors: string[]) => {
        if (typeof preprocessors === "string") {
            // Express converts a single item array into a string, so we must convert again into array
            preprocessors = [preprocessors]
        } else if (typeof preprocessors === "undefined") {
            console.log("No preprocessor selected. Getting all of them");
            try {
                preprocessors = await this.queryPreprocessingServices() as string[]
            } catch (error) {
                console.error(error)
                throw error
            }
        }
        return preprocessors
    }

    queryPreprocessingServices = () => {
        return getK8sServicesByLabel(PREPROCESSING_LABEL_SELECTOR)
    }

    callPreprocessingService = async (serviceName: string, epi: any) => {
        let url = `http://${serviceName}.default.svc.cluster.local:3000/preprocess`;
        Logger.logInfo('preprocessingProvider.ts', 'callPreprocessingService', `Querying preprocessing service: ${url}`)
        try {
            let response = await this.request.post(url, epi)
            return response.data
        } catch (error) {
            Logger.logError('preprocessingProvider.ts', 'callPreprocessingService', `Error querying preprocessing service: ${url}`)
            throw error
        }
    }

    callServicesFromList = async (preprocessors: string[], epi: any)/* : Promise<AxiosResponse> */ => {
        let errors = []
        for (let i in preprocessors) {
            let serviceName = preprocessors[i]
            try {
                epi = await this.callPreprocessingService(serviceName, epi)
            } catch (error) {
                if (error instanceof AxiosError) {
                    if (error.code === "ENOTFOUND") {
                        Logger.logError('preprocessingProvider.ts', 'callServicesFromList', `Preprocessing service not found: ${serviceName}`)
                        errors.push({ serviceName: serviceName, error: "Service not found" })
                    }
                }
            }
        };
        return [epi, errors]
    }
}