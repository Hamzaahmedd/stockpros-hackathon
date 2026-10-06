// Public cross-module surface for the payments module. Other modules (teams,
// plan-gating) must import from here, never from './service' or siblings
// directly (enforced by scripts/check-module-boundaries.cjs).
export {
  createSeatAdditionCheckout,
  createTeamCheckout,
  assertCanCreateTeam,
} from './team-billing'
export { consumeAiSignal, recordUsage, UsageSource } from './credits'
export type { MeterActor, MeterResult } from './credits'
export {
  MeteredFeature,
  SEARCH_USAGE_FEATURE,
  TEAM_MAX_SEATS,
  TEAM_MIN_SEATS,
  TEAM_SEAT_PRICE_PAISA,
  USER_SPEND_CAP_MAX_PAISA,
  USER_SPEND_CAP_MIN_PAISA,
} from './constants'
export { computeNextPeriodEnd } from './fulfillment'
export type { CreateCheckoutResult } from './types'
export { seatCountValidator, teamNameValidator } from './validation'
export { resolveUsageWindowStart, sumTeamMemberSpend } from './credits'
export { getMyUsage, CreditPool } from './usage'
export type { UsageSummary } from './usage'
export { replayStoredWebhook } from './service'
export { getSubscriptionQueues } from './scheduler'
export {
  attachTeamContext,
  composeHandlers,
  gate,
  meterPaidAiSignal,
  noTierRestriction,
  QUEUE_PRIORITY_HEADER,
  QueuePriority,
  requireAlertTypeAllowedForPlan,
  requirePlan,
  requirePlanOrQuota,
  requireSinglePortfolioForFree,
  requireWatchlistLimitForFree,
  requireWatchlistMembershipOrPro,
} from './plan-gating'
export { trackSearchUsage } from './usage-tracking'
