import type { DefaultJobOptions } from 'bullmq';

// ─── Watchlist alert email queue configuration ────────────────────────────────

export const ALERT_EMAIL_QUEUE_NAME = 'watchlist-email-notifications';

export const ALERT_EMAIL_JOB_NAME = 'send-alert-email';

// BullMQ settings shared by the alert email Queue and Worker.
export const ALERT_EMAIL_QUEUE_OPTIONS = {
  skipVersionCheck: true,
} as const;

// Alert emails are bulk, non-interactive notifications: retry with a longer
// initial backoff and retain completed/failed jobs for a wider window.
export const ALERT_EMAIL_DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { age: 24 * 60 * 60 },
  removeOnFail: { age: 72 * 60 * 60 },
};
