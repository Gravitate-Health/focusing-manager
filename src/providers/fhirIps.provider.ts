import { AxiosResponse } from 'axios';
import AxiosController from '../utils/axios';
import { Logger } from '../utils/Logger';


export class FhirIpsProvider extends AxiosController {
    constructor(baseUrl: string) {
        super(baseUrl);
    }

    getIpsByPatientIdentifier = async (identifier: string): Promise<AxiosResponse> => {
        try {
            //let url = `${this.baseUrl}/Patient/$summary?identifier=${identifier}&_format=json`;
            let url = `${this.baseUrl}/Patient/$summary`;
            let body = {
                "resourceType" : "Parameters",
                "id" : "Focusing IPS request",
                "parameter" : [{
                  "name" : "identifier",
                  "valueIdentifier" : {"value": `${identifier}`}
                }]
            }
            let response = await this.request.post(url, body);
            let data = response.data
            console.log(response.status)
            console.log(data.issue)
            try {
                if (response.status == 400 && data["issue"][0]["severity"] == "error") {
                    Logger.logInfo('FhirIpsProvider.ts', "getIpsByPatientIdentifier", `More than one patient found for the provided identifier: ${identifier}`);
                    throw new Error(`Multiple patient resources found matching provided identifier: ${identifier}`);
                } else {
                    return response
                }
            } catch (error) {
                if (data["resourceType"] == "Bundle") {
                    return response
                }
                Logger.logInfo('FhirIpsProvider.ts', "getIpsByPatientIdentifier", `No patient found for the provided identifier: ${identifier}`);
                throw new Error(`No patient found for the provided identifier: ${identifier}`)
            }
        } catch (error) {
            Logger.logError('FhirIpsProvider.ts', "getIpsByPatientIdentifier", `Error getting IPS for patient Identifier: ${identifier}`);
            throw error;
        }
    }
}