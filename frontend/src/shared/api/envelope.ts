import { isRecord } from '@/shared/utils/type-guards'

export const UNEXPECTED_RESPONSE_MESSAGE = 'Unexpected response from the server'

/**
 * Unwraps the backend's `{ success, message, data }` envelope. Anything that
 * is not that shape — an HTML page from a proxy or SPA fallback, a bare string,
 * a body with no `data` — is an error to report, never "data" to render.
 *
 * Only the envelope's structure is verified here; the field-level shape of
 * `data` is the API contract expressed by `T`.
 */
export const unwrapEnvelope = <T>(response: { data: unknown }): T => {
  const body = response.data
  if (!isRecord(body) || !('data' in body)) {
    throw new Error(UNEXPECTED_RESPONSE_MESSAGE)
  }
  return body.data as T
}

const HTTP_URL = /^https?:\/\//i

/**
 * A checkout the browser is about to be sent to. The URL must be http(s):
 * navigating to a `javascript:` or `data:` URL handed back by an API would
 * execute it, so anything else is treated as a failed response.
 */
export type CheckoutRedirect = { checkoutUrl: string; trackerId: string }

export const readCheckoutRedirect = (body: unknown): CheckoutRedirect => {
  if (
    isRecord(body) &&
    typeof body.checkoutUrl === 'string' &&
    HTTP_URL.test(body.checkoutUrl) &&
    typeof body.trackerId === 'string'
  ) {
    return { checkoutUrl: body.checkoutUrl, trackerId: body.trackerId }
  }
  throw new Error(UNEXPECTED_RESPONSE_MESSAGE)
}
