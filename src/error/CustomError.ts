import {AxiosError} from 'axios';

export interface ResponseErrorBody {}

export default class CustomError {
  public statusCode: number;
  public body: ResponseErrorBody;
  constructor(status: number, object: ResponseErrorBody) {
    this.statusCode = status
    this.body = object
  }

}
