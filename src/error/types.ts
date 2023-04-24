export interface ResponseError extends Error {
  body: ResponseErrorResponse
  statusCode: number;
}

export interface ResponseErrorResponse {
    errorData: any;
    errorDetails: any;
}
