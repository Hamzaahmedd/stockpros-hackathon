/** Minimum characters of justification required on every admin write. */
export const ADMIN_MIN_REASON_LENGTH = 10
export const ADMIN_MAX_REASON_LENGTH = 500

export const ADMIN_DEFAULT_PAGE_SIZE = 25
export const ADMIN_MAX_PAGE_SIZE = 100
export const ADMIN_SEARCH_MIN_QUERY_LENGTH = 2

/**
 * Enterprise-deal ceiling for `Team.seatCapacity`. The self-serve ceiling
 * (payments `TEAM_MAX_SEATS`, 150) deliberately does not apply to staff overrides.
 */
export const ADMIN_TEAM_MAX_SEATS = 10_000

/** Largest single manual credit movement (paisa) — keeps balances far inside Int4. */
export const ADMIN_MAX_CREDIT_ADJUSTMENT_PAISA = 100_000_000

/** Failed jobs sampled per queue in the queue-health view. */
export const ADMIN_FAILED_JOB_SAMPLE_SIZE = 5

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Stable audit `targetId` for the in-memory emergency market halt. */
export const MARKET_EMERGENCY_TARGET_ID = 'market-emergency'

/** Support-ticket reference, e.g. SUP-1234: an uppercase project key, a dash, a number. */
export const TICKET_REF_PATTERN = /^[A-Z][A-Z0-9]{1,9}-\d{1,8}$/

/** Step-up code lifetime, attempt cap and resend cooldown. */
export const STEP_UP_CODE_TTL_MS = 5 * 60 * 1000
export const STEP_UP_MAX_ATTEMPTS = 5
export const STEP_UP_REQUEST_COOLDOWN_MS = 60 * 1000

export enum TimelineEventType {
  PAYMENT = 'PAYMENT',
  CREDIT = 'CREDIT',
  SESSION = 'SESSION',
  TEAM = 'TEAM',
  STAFF_ACTION = 'STAFF_ACTION',
}

export enum AdminCreditTarget {
  USER = 'USER',
  TEAM = 'TEAM',
}

export enum AdminQueueName {
  ALERT_EMAIL = 'alert-email',
  AUTH_EMAIL = 'auth-email',
}
