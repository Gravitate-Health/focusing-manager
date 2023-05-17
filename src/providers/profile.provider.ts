import { AxiosResponse } from 'axios';
import AxiosController from '../utils/axios';
import { Logger } from "../utils/Logger";

export class ProfileProvider extends AxiosController {
    constructor(baseUrl: string) {
        super(baseUrl);
    }

    getProfileById = async (id: string): Promise<AxiosResponse> => {
        let profile: any
        Logger.logInfo('profile.provider.ts', 'getProfileById', `Getting profile with Id: ${id}`)

        try {
            // Temporal chagne due to a bug in $summary operation
            //let url = `${this.baseUrl}/Patient/${id}/$summary?_format=json`;
            let url = `${this.baseUrl}/${id}`;
            return (await this.request.get(url)).data;
        } catch (error) {
            Logger.logError('profile.provider.ts', "getProfileById", `Error getting profile for patient Id: ${id}`);
            throw error;
        }
    }

}