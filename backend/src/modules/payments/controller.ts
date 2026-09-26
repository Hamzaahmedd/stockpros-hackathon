import { NextFunction, Request, Response } from 'express'
import { UnauthorizedError, validateOrThrow } from '../../shared/errors'
import { getUserId, sendSuccess } from '../../shared/utils'
import { AuthenticatedRequest } from '../auth'
import {
  createCheckoutSession,
  handleWebhookEvent,
  verifyTracker,
} from './service'
import { SAFEPAY_SIGNATURE_HEADER, verifySafepaySignature } from './signature'
import { createCheckoutValidator, verifyTrackerValidator } from './validation'
import type { SafepayWebhookEvent } from './types'
import { logger } from '../../shared/infrastructure/logger'
import { SAFEPAY_STATE_PAID } from './constants'

export const createCheckout = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    validateOrThrow(createCheckoutValidator, req.body)

    const result = await createCheckoutSession(userId)

    return sendSuccess(res, {
      message: 'Checkout session created',
      extra: result,
    })
  } catch (error) {
    next(error)
  }
}

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
const toStringOrEmpty = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : ''

function parseSafepayWebhookPayload(body: unknown): SafepayWebhookEvent {
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

export const safepayWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const signature = req.headers[SAFEPAY_SIGNATURE_HEADER]
    const isValid = verifySafepaySignature(req.body?.data, signature)

    if (!isValid) {
      logger.warn('[Payments] Rejected Safepay webhook with invalid signature')
      throw new UnauthorizedError('Invalid webhook signature')
    }

    const event = parseSafepayWebhookPayload(req.body)
    if (!event.trackerId) {
      logger.warn('[Payments] Safepay webhook missing tracker id')
      return res.status(200).json({ received: true })
    }

    await handleWebhookEvent(event, req.body)

    return res.status(200).json({ received: true })
  } catch (error) {
    next(error)
  }
}

export const verifyTrackerHandler = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    const { trackerId } = validateOrThrow(verifyTrackerValidator, req.body)

    const result = await verifyTracker(userId, trackerId)

    return sendSuccess(res, {
      message: 'Transaction status fetched',
      extra: result,
    })
  } catch (error) {
    next(error)
  }
}
