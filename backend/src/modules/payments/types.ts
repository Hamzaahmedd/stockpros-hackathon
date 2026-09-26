import type { PaymentStatus, PlanTier } from '@prisma/client'

export interface CreateCheckoutResult {
  checkoutUrl: string
  trackerId: string
}

export interface VerifyTrackerResult {
  trackerId: string
  status: PaymentStatus
  plan: PlanTier
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
