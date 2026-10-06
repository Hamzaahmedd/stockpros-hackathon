import type { DefaultJobOptions } from 'bullmq'
import { CACHE_TTL } from '../../../shared/constants'

// ─── Watchlist alert email queue configuration ────────────────────────────────

export const ALERT_EMAIL_QUEUE_NAME = 'watchlist-email-notifications'

export const ALERT_EMAIL_JOB_NAME = 'send-alert-email'

// Subscription renewal reminders share this same queue/worker (bulk,
// business-critical, low-volume — matches the alert-email profile) rather
// than standing up a separate queue for one more email type.
export const RENEWAL_REMINDER_JOB_NAME = 'subscription-renewal-reminder'

// Team workspace invites ride the same queue for the same reasons.
export const TEAM_INVITE_JOB_NAME = 'team-invite'

// Join-request notifications (to admins, and the decision to the requester) ride it too.
export const TEAM_JOIN_REQUEST_JOB_NAME = 'team-join-request'

// Payment receipts for team workspaces ride the same queue too.
export const PAYMENT_RECEIPT_JOB_NAME = 'payment-receipt'

// Usage warnings (80% of allowance, low credit, near the spending limit) ride it too.
export const USAGE_ALERT_JOB_NAME = 'usage-alert'

// Telling a customer that staff changed their spending limit rides it too.
export const SPEND_LIMIT_CHANGED_JOB_NAME = 'spend-limit-changed'

// Staff security emails (step-up codes, risky-action alerts) ride the same queue.
export const STAFF_STEP_UP_JOB_NAME = 'staff-step-up'
export const ADMIN_ACTION_ALERT_JOB_NAME = 'admin-action-alert'

// BullMQ settings shared by the alert email Queue and Worker.
export const ALERT_EMAIL_QUEUE_OPTIONS = {
  skipVersionCheck: true,
} as const

// Alert emails are bulk notifications: longer backoff, wider retention.
export const ALERT_EMAIL_DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { age: CACHE_TTL.JOBS.ALERT_EMAIL_COMPLETED },
  removeOnFail: { age: CACHE_TTL.JOBS.ALERT_EMAIL_FAILED },
}
