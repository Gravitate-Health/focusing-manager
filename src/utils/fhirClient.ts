import axios from "axios";
import { Logger } from "./Logger";

let FHIR_IPS_URL = process.env.FHIR_IPS_URL;
let FHIR_EPI_URL = process.env.FHIR_EPI_URL;


export async function getResourceById(type: string, id: string) {
    let url: string;
    if (type === "ips") {
        url = FHIR_IPS_URL + "/Patient/" + id + "/$summary"
    } else if (type === "epi") {
        url = FHIR_EPI_URL + "/Bundle/" + id
    } else {
        return null
    }
    let response
    try {
        response = await axios.get(url)
    } catch (error) {
        Logger.logError('fhirClient.ts', 'getResourceById', `Error querying FHIR id: ${id}  --  url: ${url}`)
        console.error(error)
        return

    }
    console.log(response.data);
    return response.data
}