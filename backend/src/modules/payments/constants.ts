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

/** Billing-period lengths for the PRO subscription cycle. */
export const SUBSCRIPTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000
export const SUBSCRIPTION_REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000
/**
 * Ending a workspace updates every member (up to 150) inside one transaction,
 * which can exceed Prisma's 5 s default on a remote database.
 */
export const TEAM_EXPIRY_TX_TIMEOUT_MS = 30_000

export const SUBSCRIPTION_GRACE_PERIOD_MS = 2 * 24 * 60 * 60 * 1000

/** Per-seat monthly price for the TEAM tier (Rs 7,499 -> 749900 paisa). */
export const TEAM_SEAT_PRICE_PAISA = 749_900
export const TEAM_MIN_SEATS = 2
export const TEAM_MAX_SEATS = 150

export enum CheckoutPlan {
  PRO = 'PRO',
  TEAM = 'TEAM',
  TOPUP = 'TOPUP',
}

/** Whether a subscription operation targets the caller's own PRO plan or their team workspace. */
export enum SubscriptionScope {
  USER = 'USER',
  TEAM = 'TEAM',
}

/** Prepaid credit packs purchasable as TOPUP — amounts are server-derived, never client-supplied. */
export enum TopupPackId {
  PACK_500 = 'PACK_500',
  PACK_1000 = 'PACK_1000',
  PACK_2500 = 'PACK_2500',
}

export const TOPUP_PACK_PRICES_PAISA: Record<TopupPackId, number> = {
  [TopupPackId.PACK_500]: 50_000,
  [TopupPackId.PACK_1000]: 100_000,
  [TopupPackId.PACK_2500]: 250_000,
}

/** Metered AI actions: draw from the billing-cycle base quota, then from credits. */
export enum MeteredFeature {
  AI_FORECAST = 'ai_forecast',
  AI_DECISION = 'ai_decision',
}

/** Which billing cycle the usage history covers. */
export enum UsageHistoryRange {
  CURRENT = 'current',
  PREVIOUS = 'previous',
}

/** Whose usage a history response aggregates: the caller's own, or the whole workspace (owner/admin). */
export enum UsageHistoryScope {
  USER = 'USER',
  TEAM = 'TEAM',
}

/** Time zone used to bucket daily usage when the client sends none. */
export const DEFAULT_USAGE_TIME_ZONE = 'UTC'

/** Unmetered usage recorded only for team analytics. */
export const SEARCH_USAGE_FEATURE = 'search'

export const PRO_MONTHLY_AI_SIGNALS = 300
export const TEAM_QUOTA_MULTIPLIER = 1.25
export const TEAM_MONTHLY_AI_SIGNALS = Math.floor(
  PRO_MONTHLY_AI_SIGNALS * TEAM_QUOTA_MULTIPLIER,
)

/** Credit drawn per AI signal once the base quota is exhausted (Rs 50). */
export const OVERAGE_COST_PAISA_PER_SIGNAL = 5_000

/** Bounds for the spending limit an individual Pro user can set: one signal up to Rs 100,000. */
export const USER_SPEND_CAP_MIN_PAISA = OVERAGE_COST_PAISA_PER_SIGNAL
export const USER_SPEND_CAP_MAX_PAISA = 10_000_000
