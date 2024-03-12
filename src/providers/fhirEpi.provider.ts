import { Axios, AxiosRequestConfig, AxiosResponse } from 'axios';
import AxiosController from '../utils/axios';
import { Logger } from '../utils/Logger';


export class FhirEpiProvider extends AxiosController {
    constructor(baseUrl: string) {
        super(baseUrl);
    }

    getEpiById = async (id: string): Promise<AxiosResponse> => {
        try {
            let url = `${this.baseUrl}/Bundle/${id}?_format=json`;
            return await this.request.get(url);
        } catch (error) {
            Logger.logError('FhirProvider.ts', "getEpiById", 'Error getting epi by id. Error: ' + error);
            throw error;
        }
    }
}