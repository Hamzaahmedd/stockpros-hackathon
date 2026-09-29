// Public cross-module surface for the notifications module.
// Exposes only what other modules may depend on, without pulling in the
// router/middleware chain (keeps callers free of circular imports).
export { enqueueAuthEmail } from './infrastructure/auth-email-worker'
export { enqueueRenewalReminderEmail } from './infrastructure/email-worker'
export { sendDailyDigestsToAllSubscribers } from './digest-service'
export { runNotificationCleanupJob } from './notification-cleanup-job'
export { INTEREST_TO_CATEGORIES } from './preferences'
export type {
  AuthEmailJobPayload,
  RenewalReminderEmailJobPayload,
} from './types'
export type { RenewalReminderVariant } from './email-templates/subscription-renewal'
export type { MarketInterest } from './preferences'
