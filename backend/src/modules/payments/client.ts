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

export default safepayClient
