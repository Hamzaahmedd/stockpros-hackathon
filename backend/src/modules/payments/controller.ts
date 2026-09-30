import { NextFunction, Request, Response } from 'express'
import { UnauthorizedError, validateOrThrow } from '../../shared/errors'
import { getUserId, sendSuccess } from '../../shared/utils'
import { AuthenticatedRequest } from '../auth'
import {
  createCheckoutSession,
  getSubscriptionSummary,
  handleSubscriptionRenewalWebhookEvent,
  handleWebhookEvent,
  renewSubscription,
  toggleAutoRenew,
  verifyTracker,
} from './service'
import { SAFEPAY_SIGNATURE_HEADER, verifySafepaySignature } from './signature'
import {
  createCheckoutValidator,
  creditLedgerQueryValidator,
  subscriptionScopeQueryValidator,
  toggleAutoRenewValidator,
  verifyTrackerValidator,
} from './validation'
import type {
  CreateCheckoutResult,
  SafepaySubscriptionWebhookEvent,
  SafepayWebhookEvent,
} from './types'
import { logger } from '../../shared/infrastructure/logger'
import {
  CheckoutPlan,
  SAFEPAY_STATE_PAID,
  SubscriptionScope,
} from './constants'
import { getCreditLedger } from './ledger'
import { getMyUsage } from './usage'
import {
  createTeamCheckout,
  createTeamRenewalCheckout,
  createTopupCheckout,
  getTeamSubscriptionSummary,
  toggleTeamAutoRenew,
} from './team-billing'

export const createCheckout = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    const input = validateOrThrow(createCheckoutValidator, req.body)

    let result: CreateCheckoutResult
    switch (input.plan) {
      case CheckoutPlan.TEAM:
        result = await createTeamCheckout(userId, input)
        break
      case CheckoutPlan.TOPUP:
        result = await createTopupCheckout(userId, input.packId)
        break
      default:
        result = await createCheckoutSession(userId, input.paymentMethod)
    }

    return sendSuccess(res, {
      message: 'Checkout session created',
      extra: result,
    })
  } catch (error) {
    next(error)
  }
}

export const getSubscription = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    const { scope } = validateOrThrow(
      subscriptionScopeQueryValidator,
      req.query,
    )
    const result =
      scope === SubscriptionScope.TEAM
        ? await getTeamSubscriptionSummary(userId)
        : await getSubscriptionSummary(userId)

    return sendSuccess(res, {
      message: 'Subscription fetched',
      extra: result,
    })
  } catch (error) {
    next(error)
  }
}

export const getCreditLedgerHandler = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    const query = validateOrThrow(creditLedgerQueryValidator, req.query)
    const data = await getCreditLedger(userId, query)

    return sendSuccess(res, { message: 'Credit history fetched', data })
  } catch (error) {
    next(error)
  }
}

export const getMyUsageHandler = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getMyUsage(getUserId(req))

    return sendSuccess(res, { message: 'Usage fetched', data })
  } catch (error) {
    next(error)
  }
}

export const renewSubscriptionHandler = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    const { scope } = validateOrThrow(
      subscriptionScopeQueryValidator,
      req.query,
    )
    const result =
      scope === SubscriptionScope.TEAM
        ? await createTeamRenewalCheckout(userId)
        : await renewSubscription(userId)

    return sendSuccess(res, {
      message: 'Renewal checkout session created',
      extra: result,
    })
  } catch (error) {
    next(error)
  }
}

export const toggleAutoRenewHandler = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    const { enabled, scope } = validateOrThrow(
      toggleAutoRenewValidator,
      req.body,
    )
    const result =
      scope === SubscriptionScope.TEAM
        ? await toggleTeamAutoRenew(userId, enabled)
        : await toggleAutoRenew(userId, enabled)

    return sendSuccess(res, {
      message: `Auto-renew ${enabled ? 'enabled' : 'disabled'}`,
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

/**
 * Detects the Plan-based recurring-subscription webhook shape
 * (`data.type === 'payment.succeeded' | 'payment.failed'`), distinct from
 * the one-time checkout shape above — see types.ts's doc comment on
 * `SafepaySubscriptionWebhookEvent` for why this is a best-effort shape, not
 * a confirmed fixture. Returns null when the payload doesn't match, so the
 * caller falls back to the one-time parser.
 */
function parseSafepaySubscriptionWebhookPayload(
  body: unknown,
): SafepaySubscriptionWebhookEvent | null {
  const payload = body as { data?: Record<string, unknown> }
  const data = payload?.data ?? {}
  const type = toStringOrEmpty(data.type)

  if (type !== 'payment.succeeded' && type !== 'payment.failed') {
    return null
  }

  const reference = toStringOrEmpty(data.reference)
  if (!reference) {
    return null
  }

  return { type, reference }
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

    const subscriptionEvent = parseSafepaySubscriptionWebhookPayload(req.body)
    if (subscriptionEvent) {
      await handleSubscriptionRenewalWebhookEvent(subscriptionEvent)
      return res.status(200).json({ received: true })
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
