import config from '@/config'
import axios from 'axios'
import { logger } from '../../shared/infrastructure/logger'
import {
  PAYMENT_CURRENCY,
  SAFEPAY_CHECKOUT_SOURCE,
  SAFEPAY_WEBHOOKS_ENABLED,
} from './constants'

const safepayClient = axios.create({
  baseURL: config.safepay.baseUrl,
  timeout: 15000,
})

export interface InitPaymentSessionResult {
  /** Safepay's own tracker/session identifier (the "beacon" used to build the checkout URL). */
  token: string
}

/**
 * Step 1 of Safepay's v1 hosted-checkout flow: POST /order/v1/init creates a
 * payment tracker and returns its token. Confirmed against the official
 * safepay-node SDK source (Payments.create -> POST /order/v1/init, body
 * {amount, client, currency, environment}, response {data: {token}}) —
 * https://github.com/getsafepay/safepay-node/blob/master/src/resources/payments.ts
 *
 * When `config.safepay.mockProvider` is true, this short-circuits to a fake
 * token for local/CI runs (same convention as
 * `shared/infrastructure/clients/sendpk.ts`'s MOCK_WHATSAPP_PROVIDER) — an
 * explicit, visible setting rather than something inferred from a missing key.
 */
export async function initPaymentSession(
  amountPaisa: number,
): Promise<InitPaymentSessionResult> {
  if (config.safepay.mockProvider) {
    const mockToken = `mock_${Date.now()}`
    logger.debug(
      `[Safepay:mock] Would init payment session token=${mockToken} amount=${amountPaisa}`,
    )
    return { token: mockToken }
  }

  if (!config.safepay.apiKey) {
    throw new Error('Safepay is not configured (missing SAFEPAY_API_KEY)')
  }

  try {
    const response = await safepayClient.post('/order/v1/init', {
      amount: amountPaisa,
      client: config.safepay.apiKey,
      currency: PAYMENT_CURRENCY,
      environment: config.safepay.environment,
    })

    const token = response.data?.data?.token
    if (!token) {
      throw new Error('Safepay order/v1/init response did not include a token')
    }

    return { token }
  } catch (err) {
    logger.error('[Safepay] Failed to initiate payment session', err)
    throw new Error('Failed to initiate Safepay payment session')
  }
}

export interface BuildCheckoutUrlParams {
  token: string
  orderId: string
  redirectUrl: string
  cancelUrl: string
}

/**
 * Step 2 of the v1 flow: the hosted checkout URL is built client-side, not
 * fetched via another API call — confirmed against safepay-node's
 * Checkout.create(), which is a synchronous URLSearchParams builder, not an
 * axios request:
 * https://github.com/getsafepay/safepay-node/blob/master/src/resources/checkout.ts
 *
 * `webhooks` is explicitly forced to `true` — Safepay's own SDK defaults it
 * to `false`, but this app's Payment Mode is entirely webhook-driven (see
 * modules/payments/service.ts's handleWebhookEvent), so a tracker created
 * with webhooks disabled would never confirm.
 */
export function buildCheckoutUrl(params: BuildCheckoutUrlParams): string {
  if (config.safepay.mockProvider) {
    return `${config.server.frontendUrl}/plans/result?tracker_id=${params.token}&status=mock-pending`
  }

  const checkoutParams = new URLSearchParams({
    beacon: params.token,
    cancel_url: params.cancelUrl,
    env: config.safepay.environment,
    order_id: params.orderId,
    redirect_url: params.redirectUrl,
    source: SAFEPAY_CHECKOUT_SOURCE,
    webhooks: SAFEPAY_WEBHOOKS_ENABLED,
  })

  return `${config.safepay.checkoutBaseUrl}?${checkoutParams.toString()}`
}

// ─── Phase 2: Plan-based recurring card subscriptions ────────────────────────
//
// Safepay's recurring-billing product is fundamentally different from the
// one-time flow above: rather than us tokenizing a card and triggering
// charges ourselves, the customer authorizes a pre-existing merchant "Plan"
// once via a hosted subscribe page, and SAFEPAY'S OWN SYSTEM bills the card
// each cycle, notifying us via `payment.succeeded`/`payment.failed`
// webhooks (see service.ts's handleSubscriptionRenewalWebhookEvent).
//
// Endpoint paths/field names below are BEST-EFFORT, assembled from the
// official SDKs' source (not a live-verified fixture, unlike order/v1/init
// above):
//   - Plan resource path `/client/plans/v1/` — confirmed from
//     getsafepay/sfpy-php's lib/Plan.php (OBJECT_PATH = 'client.plans.v1').
//   - Passport ("tbt" token) resource, used via $safepay->passport->create()
//     in sfpy-php and auth.passport.create() in the Node SDK; endpoint path
//     `/client/passport/v1/token` per third-party research, not a fixture.
//   - Subscribe-checkout construction (PHP: SubscriptionsCheckout::constructURL,
//     Node: safepay.checkout.createSubscription({ planId, reference })) is a
//     client-side URL builder like Checkout.create() above, not a separate
//     API call — mirrored here the same way.
//   - subscription.cancel()/.pause()/.resume() exist in the Node SDK keyed by
//     a Safepay-assigned subscriptionId; the exact REST path they call was
//     not visible in the SDK's README, so the paths below are a plausible
//     guess following the same `/client/<resource>/v1/<id>/<action>` shape
//     as Plan's own path.
//
// None of this has been run against Safepay's real sandbox. Treat every
// non-mock function below as a first draft to verify before going live.

const requireSafepayCredentials = (): void => {
  if (!config.safepay.apiKey) {
    throw new Error('Safepay is not configured (missing SAFEPAY_API_KEY)')
  }
  if (!config.safepay.proPlanId) {
    throw new Error('Safepay is not configured (missing SAFEPAY_PRO_PLAN_ID)')
  }
}

interface CreatePassportTokenResult {
  tbt: string
}

const createPassportToken = async (): Promise<CreatePassportTokenResult> => {
  const response = await safepayClient.post('/client/passport/v1/token', {
    client: config.safepay.apiKey,
    environment: config.safepay.environment,
  })

  const tbt = response.data?.data?.token
  if (!tbt) {
    throw new Error(
      'Safepay passport/v1/token response did not include a token',
    )
  }

  return { tbt }
}

export interface CreateSubscriptionCheckoutParams {
  /**
   * Our own correlation key, sent to Safepay as `reference` and expected to
   * be echoed back on the eventual `payment.succeeded`/`payment.failed`
   * webhook. Callers pass the owning `Subscription` row's own id.
   */
  reference: string
  redirectUrl: string
  cancelUrl: string
}

export interface CreateSubscriptionCheckoutResult {
  /**
   * Our correlation id for this subscription. In mock mode and initially in
   * live mode this is just `params.reference` echoed back — service.ts
   * updates it if Safepay's own webhook later supplies a distinct id.
   */
  safepaySubscriptionId: string
  subscriptionCheckoutUrl: string
}

/**
 * Builds the hosted "subscribe" checkout URL for authorizing a recurring
 * card subscription against the configured Plan. When
 * `config.safepay.mockProvider` is true, short-circuits like the one-time
 * flow's mock path — no network call, deterministic for local/CI runs.
 */
export async function createSubscriptionCheckout(
  params: CreateSubscriptionCheckoutParams,
): Promise<CreateSubscriptionCheckoutResult> {
  if (config.safepay.mockProvider) {
    logger.debug(
      `[Safepay:mock] Would create subscription checkout reference=${params.reference}`,
    )
    return {
      safepaySubscriptionId: params.reference,
      subscriptionCheckoutUrl: `${config.server.frontendUrl}/plans/result?tracker_id=${params.reference}&status=mock-pending`,
    }
  }

  requireSafepayCredentials()

  try {
    const { tbt } = await createPassportToken()

    const checkoutParams = new URLSearchParams({
      plan_id: config.safepay.proPlanId,
      tbt,
      reference: params.reference,
      cancel_url: params.cancelUrl,
      redirect_url: params.redirectUrl,
      env: config.safepay.environment,
    })

    return {
      safepaySubscriptionId: params.reference,
      subscriptionCheckoutUrl: `${config.safepay.checkoutBaseUrl}/subscribe?${checkoutParams.toString()}`,
    }
  } catch (err) {
    logger.error('[Safepay] Failed to create subscription checkout', err)
    throw new Error('Failed to create Safepay subscription checkout')
  }
}

/** Turns off recurring auto-charging for an authorized subscription. */
export async function pauseSafepaySubscription(
  safepaySubscriptionId: string,
): Promise<void> {
  if (config.safepay.mockProvider) {
    logger.debug(
      `[Safepay:mock] Would pause subscription id=${safepaySubscriptionId}`,
    )
    return
  }

  requireSafepayCredentials()

  try {
    await safepayClient.post(
      `/client/subscriptions/v1/${safepaySubscriptionId}/pause`,
      { client: config.safepay.apiKey },
    )
  } catch (err) {
    logger.error('[Safepay] Failed to pause subscription', err)
    throw new Error('Failed to pause Safepay subscription')
  }
}

/** Re-enables recurring auto-charging for a previously paused subscription. */
export async function resumeSafepaySubscription(
  safepaySubscriptionId: string,
): Promise<void> {
  if (config.safepay.mockProvider) {
    logger.debug(
      `[Safepay:mock] Would resume subscription id=${safepaySubscriptionId}`,
    )
    return
  }

  requireSafepayCredentials()

  try {
    await safepayClient.post(
      `/client/subscriptions/v1/${safepaySubscriptionId}/resume`,
      { client: config.safepay.apiKey },
    )
  } catch (err) {
    logger.error('[Safepay] Failed to resume subscription', err)
    throw new Error('Failed to resume Safepay subscription')
  }
}

export default safepayClient
