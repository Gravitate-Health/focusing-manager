import {AxiosError} from 'axios';
import { Logger } from "../utils/Logger";

export interface ResponseErrorBody {}

export default class ResponseError implements ResponseError {
  public statusCode: number;
  public body: ResponseErrorBody;
  constructor(error: AxiosError) {
    let statusCode = error.response!.status || 500;
    let body = {
      errorData: error.response!.data,
      //errorDetails: error.response!.data.error.details,
    };
    Logger.logError("ResponseError.ts", " - ", `Creating error with status code ${statusCode} and body: ${JSON.stringify(body)}`);
    this.body = body
    this.statusCode = statusCode
  }

}
