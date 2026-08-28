import { Response } from 'express'

export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  data?: T
  [key: string]: any
}

export interface ApiErrorResponse {
  success: false
  message: string
  statusCode: number
  details?: unknown
  errorCode?: string
}

export interface SendSuccessOptions<T = any> {
  data?: T
  message?: string
  statusCode?: number
  extra?: Record<string, any>
}

export interface SendErrorOptions {
  message: string
  statusCode?: number
  details?: unknown
  errorCode?: string
}

/**
 * Sends a standardized success response envelope.
 */
export const sendSuccess = <T = any>(
  res: Response,
  options: SendSuccessOptions<T> = {},
): Response => {
  const { data, message, statusCode = 200, extra = {} } = options
  const payload: ApiResponse<T> = {
    success: true,
    ...(message ? { message } : {}),
    ...(data !== undefined ? { data } : {}),
    ...extra,
  }
  return res.status(statusCode).json(payload)
}

/**
 * Sends a standardized error response envelope.
 */
export const sendError = (
  res: Response,
  options: SendErrorOptions,
): Response => {
  const { message, statusCode = 500, details, errorCode } = options
  const payload: ApiErrorResponse = {
    success: false,
    message,
    statusCode,
    ...(details !== undefined ? { details } : {}),
    ...(errorCode ? { errorCode } : {}),
  }
  return res.status(statusCode).json(payload)
}
