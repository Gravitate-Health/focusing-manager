import { AxiosResponse } from 'axios';
import AxiosController from '../utils/axios';
import { Logger } from "../utils/Logger";

export class PersonaVectorProvider extends AxiosController {
    constructor(baseUrl: string) {
        super(baseUrl);
    }

    getPersonaVectorById = async (id: string): Promise<AxiosResponse> => {
        let personaVector: any
        Logger.logInfo('personaVector.provider.ts', 'getPersonaVectorById', `Getting persona vector with Id: ${id}`)

        try {
            // Temporal chagne due to a bug in $summary operation
            //let url = `${this.baseUrl}/Patient/${id}/$summary?_format=json`;
            let url = `${this.baseUrl}/${id}`;
            return (await this.request.get(url)).data;
        } catch (error) {
            Logger.logError('personaVector.provider.ts', "getPersonaVectorById", `Error getting persona vector for patient Id: ${id}`);
            throw error;
        }
    }

}