import type {
  PaymentStatus,
  PlanTier,
  SubscriptionPaymentMethod,
  SubscriptionStatus,
} from '@prisma/client'

export type { SubscriptionPaymentMethod, SubscriptionStatus }

export interface CreateCheckoutResult {
  checkoutUrl: string
  trackerId: string
}

export interface VerifyTrackerResult {
  trackerId: string
  status: PaymentStatus
  plan: PlanTier
}

export interface SubscriptionSummary {
  paymentMethod: SubscriptionPaymentMethod
  autoRenew: boolean
  status: SubscriptionStatus
  currentPeriodEnd: Date | null
  gracePeriodEnd: Date | null
}

/**
 * Normalized shape this module reads off a Safepay webhook payload. The raw
 * payload is stored as-is in `PaymentTransaction.rawWebhookPayload`; this is
 * only the subset we actively branch on.
 */
export interface SafepayWebhookEvent {
  trackerId: string
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PENDING'
  paymentMethod?: string
}

/**
 * Normalized shape for a Plan-based recurring-subscription webhook event
 * (`payment.succeeded`/`payment.failed`), as distinct from the one-time
 * checkout webhook above. `reference` is expected to echo back the value we
 * originally sent Safepay when creating the subscription checkout (our own
 * `Subscription.id`) — this shape is a best-effort assumption (see
 * client.ts's `createSubscriptionCheckout` doc comment), not confirmed
 * against a real Safepay payload.
 */
export interface SafepaySubscriptionWebhookEvent {
  type: 'payment.succeeded' | 'payment.failed'
  reference: string
}
