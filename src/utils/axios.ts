import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { Logger } from '../utils/Logger';
import { stringify } from 'qs';
import ResponseError from '../error/ResponseError';

class AxiosController {
  protected readonly axiosInstance: AxiosInstance;

  axiosConfig: AxiosRequestConfig;
  baseUrl: string;

  public constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.axiosConfig = this._createAxiosConfig(baseUrl);
    this.axiosInstance = axios.create(this.axiosConfig);

    this._initializeRequestInterceptor();
    this._initializeResponseInterceptor();
  }

  private _createAxiosConfig = (baseUrl: string): AxiosRequestConfig => {
    return {
      baseURL: baseUrl,
      timeout: 10 * 1000,
      headers: {
        Accept: '*/*',
        Authorization: '',
      },
    };
  };
  private _initializeRequestInterceptor = () => { };

  private _initializeResponseInterceptor = () => {
    this.axiosInstance.interceptors.response.use(
      this._handleResponse,
      this._handleResponseError,
    );
  };

  private _handleResponse = (response: AxiosResponse) => {
    Logger.logInfo("axios.ts", "Handle response",
      `[Response interceptor] [Status: ${response.status}] [Data: ${response.data}]`,
    );
    return response;
  };


  private _handleResponseError = async (error: any) => {
    const originalConfig = error.config as AxiosRequestConfig;

    let errorUrl = error.config.url;
    if (error.response) {
      // The request was made and the server responded with a status code outside of 2xx

      Logger.logError("axios.ts", "Handle error response",
        `[Response Error Interceptor] Error URL: ${errorUrl}`,
      );
      let errorStatusCode = error.response.status;
      let errorMessage, errorData, errorDetails;
      try {
        errorMessage = error.response.data.errorMessage;
        errorData = error.response.data.error;
        errorDetails = error.response.data.error.details;
      } catch (error) { }
      let errorHeaders = error.request.headers;
      Logger.logError("axios.ts", "Handle error response",
        `[Response Error Interceptor] [Request Headers: ${errorHeaders}]`,
      );
      Logger.logError(
        "axios.ts", "Handle error response",
        `[Response Error Interceptor] [Status Code: ${errorStatusCode}]`,
      );
      Logger.logError(
        "axios.ts", "Handle error response",
        `[Response Error Interceptor] [Error Message: ${errorMessage}] [Error Data: ${JSON.stringify(
          errorData,
        )}] [Error Details: ${errorDetails}]  [Error Details: ${errorDetails}]`,
      );
      switch (errorStatusCode) {
        case 400:
          error.response!.data.error = 'Bad Request';
          break;
        case 401:
          errorStatusCode = 500;
          error.response!.data.error = 'Internal server error';
          break;
        case 404:
          error.response!.data.error = 'Not found';
          break;
        case 409:
          error.response!.data.error = 'Conflict';
          break;
        case 422:
          error.response!.data.error =
            'Unprocessable entity. Send correct body in petition';
          break;
        case 503:
          error.response!.data.error = 'Service unavailable';
          break;
        default:
          errorStatusCode = 500;
          break;
      }
      error.response.status = errorStatusCode
      throw new ResponseError(error);
    } else if (error.request) {
      // The request was made but no response was received. `error.request` is an instance of http.ClientRequest
      console.log('error.request');
      Logger.logError("axios.ts", "Handle error response", JSON.stringify(error));
    } else {
      console.log('error');
      Logger.logError("axios.ts", "Handle error response", `Error: ${error.message}`);
    }
    throw new Error('error');
  };

  request = {
    get: <T>(endpoint: string, config?: AxiosRequestConfig) =>
      this.axiosInstance.get<T>(endpoint, config).then(response),
    post: <T>(endpoint: string, body: {}, config?: AxiosRequestConfig) =>
      this.axiosInstance.post<T>(endpoint, body, config).then(response),
    put: <T>(endpoint: string, body: {}, config?: AxiosRequestConfig) =>
      this.axiosInstance.put<T>(endpoint, body, config).then(response),
    patch: <T>(endpoint: string, body: {}, config?: AxiosRequestConfig) =>
      this.axiosInstance.patch<T>(endpoint, body, config).then(response),
    delete: <T>(endpoint: string, config?: AxiosRequestConfig) =>
      this.axiosInstance.delete<T>(endpoint, config).then(response),
  };
}
const response = (response: AxiosResponse) => response;

export default AxiosController;
