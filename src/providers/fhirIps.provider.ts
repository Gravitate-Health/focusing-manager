import { Axios, AxiosRequestConfig, AxiosResponse } from 'axios';
import AxiosController from '../utils/axios';
import { Logger } from '../utils/Logger';


export class FhirIpsProvider extends AxiosController {
    constructor(baseUrl: string) {
        super(baseUrl);
    }

    getIpsByPatientId = async (id: string): Promise<AxiosResponse> => {
        try {
            // Temporal chagne due to a bug in $summary operation
            let url = `${this.baseUrl}/Patient/${id}/$summary?_format=json`;
            //let url = `${this.baseUrl}/Composition/${id}/$document?_format=json`;
            return await this.request.get(url);
        } catch (error) {
            Logger.logError('FhirIpsProvider.ts', "getIpsByPatientId", `Error getting IPS for patient Id: ${id}`);
            throw error;
        }
    }
}