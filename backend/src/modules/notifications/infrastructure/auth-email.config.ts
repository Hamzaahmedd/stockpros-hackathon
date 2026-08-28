import type { DefaultJobOptions } from 'bullmq'

// ─── Auth (magic-link) email queue configuration ──────────────────────────────

export const AUTH_EMAIL_QUEUE_NAME = 'auth-email-notifications'

export const AUTH_EMAIL_JOB_NAME = 'send-magic-link-email'

// BullMQ settings shared by the auth email Queue and Worker.
export const AUTH_EMAIL_QUEUE_OPTIONS = {
  skipVersionCheck: true,
} as const

// Login links are latency-sensitive: short backoff, few retries.
export const AUTH_EMAIL_DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { age: 60 * 60 },
  removeOnFail: { age: 24 * 60 * 60 },
}
