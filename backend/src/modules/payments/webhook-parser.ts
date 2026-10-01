import { SAFEPAY_STATE_PAID } from './constants'
import type { SafepayWebhookEvent } from './types'

/**
 * Maps a Safepay webhook payload onto the subset of fields this module acts
 * on. Shape confirmed against the official safepay-node SDK's own webhook
 * test fixture (test/fixtures/verify.ts):
 *
 *   { data: { token, type, notification: { tracker, state, intent, amount, currency, metadata } } }
 *
 * `data.token` is the same identifier returned as `token` from
 * `POST /order/v1/init` (what this module stores as `PaymentTransaction.trackerId`).
 * `notification.state` only has `"PAID"` confirmed as a real value from that
 * fixture — no full enum is published, so anything else is treated as still
 * PENDING rather than guessed at as FAILED/CANCELLED (a slower resolution is
 * safer than wrongly closing out a transaction that's still processing).
 * `notification.intent` is the payment channel used (e.g. JazzCash/Easypaisa/
 * card processor name), mapped onto `paymentMethod`.
 */
export const toStringOrEmpty = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : ''

export function parseSafepayWebhookPayload(body: unknown): SafepayWebhookEvent {
  const payload = body as { data?: Record<string, unknown> }
  const data = payload?.data ?? {}
  const notification = (data.notification as Record<string, unknown>) ?? {}

  const trackerId =
    toStringOrEmpty(data.token) || toStringOrEmpty(notification.tracker)
  const rawState = toStringOrEmpty(notification.state).toUpperCase()
  const status: SafepayWebhookEvent['status'] =
    rawState === SAFEPAY_STATE_PAID ? 'COMPLETED' : 'PENDING'

  return {
    trackerId,
    status,
    paymentMethod: notification.intent as string | undefined,
  }
}
