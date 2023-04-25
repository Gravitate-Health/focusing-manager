import { Axios, AxiosRequestConfig, AxiosResponse } from 'axios';
import AxiosController from '../utils/axios';
import { Logger } from '../utils/Logger';


export class FhirIpsProvider extends AxiosController {
    constructor(baseUrl: string) {
        super(baseUrl);
    }

    getIpsByPatientId = async (id: string): Promise<AxiosResponse> => {
        try {
            let url = `${this.baseUrl}/Patient/${id}/$summary`;
            return await this.request.get(url);
        } catch (error) {
            Logger.logError('FhirIpsProvider.ts', "getIpsByPatientId", `Error getting IPS for patient Id: ${id}`);
            throw error;
        }
    }
}