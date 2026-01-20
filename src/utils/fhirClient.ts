import axios, { HttpStatusCode } from "axios";
import { Logger } from "./Logger.js";

let FHIR_IPS_URL = process.env.FHIR_IPS_URL;
let FHIR_EPI_URL = process.env.FHIR_EPI_URL;


export function getFhirResourceById(type: string, id: string) {
    let url: string;
    if (type === "ips") {
        url = FHIR_IPS_URL + "/Patient/" + id + "/$summary"
    } else if (type === "epi") {
        url = FHIR_EPI_URL + "/Bundle/" + id
    } else {
        return null
    }
    return axios.get(url)
}