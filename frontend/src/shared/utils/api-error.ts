import { asNonEmptyString, isRecord } from './type-guards'

/**
 * A failed API response's body, read defensively. Response bodies are
 * `unknown` until proven otherwise: a proxy's HTML error page, a plain-text
 * 502, an array or an empty body must all degrade to "no details", never throw.
 */
export type ApiErrorBody = {
  message?: string
  errorCode?: string
  details?: unknown
}

export const readApiErrorBody = (data: unknown): ApiErrorBody =>
  isRecord(data)
    ? {
        message: asNonEmptyString(data.message),
        errorCode: asNonEmptyString(data.errorCode),
        details: data.details,
      }
    : {}

const responseDataOf = (err: unknown): unknown =>
  isRecord(err) && isRecord(err.response) ? err.response.data : undefined

/** Parsed body of the failed response carried by an axios-style error. */
export const apiErrorBody = (err: unknown): ApiErrorBody =>
  readApiErrorBody(responseDataOf(err))

/** Pulls the server's `message` out of an error, falling back to a caller-supplied default. */
export const apiErrorMessage = (err: unknown, fallback: string): string =>
  apiErrorBody(err).message ?? fallback
