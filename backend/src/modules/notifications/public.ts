// Public cross-module surface for the notifications module.
// Exposes only what other modules may depend on, without pulling in the
// router/middleware chain (keeps callers free of circular imports).
export { enqueueAuthEmail } from './infrastructure/auth-email-worker'
export { sendDailyDigestsToAllSubscribers } from './digest-service'
export { runNotificationCleanupJob } from './notification-cleanup-job'
export { INTEREST_TO_CATEGORIES } from './preferences'
export type { AuthEmailJobPayload } from './types'
export type { MarketInterest } from './preferences'

