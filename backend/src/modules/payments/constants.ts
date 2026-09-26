import type { PlanTier } from '@prisma/client'

/**
 * Server-derived pricing table — amounts are never accepted from the client.
 * Safepay pay-ins are integer paisa (Rs 5,999 -> 599900).
 */
export const PLAN_PRICES_PAISA: Record<Extract<PlanTier, 'PRO'>, number> = {
  PRO: 599_900,
}

export const PAYMENT_CURRENCY = 'PKR'

/** Safepay checkout-URL param values fixed by this integration (see client.ts). */
export const SAFEPAY_CHECKOUT_SOURCE = 'custom'
export const SAFEPAY_WEBHOOKS_ENABLED = 'true'

/**
 * The only Safepay `notification.state` value confirmed against a real
 * fixture (safepay-node's own webhook test data). No full state enum is
 * published, so this is the single known-good success value to compare
 * against — everything else is treated as still PENDING rather than guessed.
 */
export const SAFEPAY_STATE_PAID = 'PAID'
