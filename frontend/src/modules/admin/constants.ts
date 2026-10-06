import type { PlanTier, PlatformRole } from '@/modules/auth/types'

/** Ascending privilege order — mirrors the backend `PLATFORM_ROLE_RANK`. */
export const PLATFORM_ROLE_RANK: Readonly<Record<PlatformRole, number>> = {
  USER: 0,
  SUPPORT_AGENT: 1,
  PLATFORM_ADMIN: 2,
  SUPER_ADMIN: 3,
}

/** Every role that may open the ops panel. */
export const STAFF_ROLES: readonly PlatformRole[] = [
  'SUPPORT_AGENT',
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
]

/** Minimum characters of justification the API requires on every write. */
export const ADMIN_MIN_REASON_LENGTH = 10

/** How long revealed customer details stay on screen before they are masked again. */
export const REVEAL_VISIBLE_MS = 60_000
export const ADMIN_MAX_REASON_LENGTH = 500

/** Support-ticket reference, e.g. SUP-1234. Mirrors the API's `TICKET_REF_PATTERN`. */
export const TICKET_REF_PATTERN = /^[A-Z][A-Z0-9]{1,9}-\d{1,8}$/

/** Error code the API answers with when a write needs a fresh emailed-code verification. */
export const STEP_UP_REQUIRED_CODE = 'STEP_UP_REQUIRED'

/** The 6-digit code from the step-up email. */
export const STEP_UP_CODE_PATTERN = /^\d{6}$/

/** Ids the admin API accepts (UUIDs); used to disable submit on malformed input. */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const ADMIN_PLANS: readonly PlanTier[] = ['FREE', 'PRO', 'TEAM']

export enum AdminTab {
  USERS = 'users',
  TEAMS = 'teams',
  BILLING = 'billing',
  TELEMETRY = 'telemetry',
  SYSTEM = 'system',
}

export enum CreditTarget {
  USER = 'USER',
  TEAM = 'TEAM',
}

export const CREDIT_LEDGER_TYPES = [
  'PURCHASE',
  'OVERAGE_CONSUMPTION',
  'REFUND',
  'MANUAL_ADJUSTMENT',
] as const

export const PAYMENT_STATUSES = [
  'PENDING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const

export const ADMIN_AUDIT_ACTIONS = [
  'PLAN_OVERRIDE',
  'CREDIT_INJECTION',
  'SUBSCRIPTION_EXTENDED',
  'DOMAIN_FORCE_VERIFIED',
  'SEAT_CAPACITY_OVERRIDE',
  'MEMBER_FORCE_REMOVED',
  'USER_SESSION_INVALIDATED',
  'FEATURE_FLAG_TOGGLED',
  'EMERGENCY_MARKET_TOGGLED',
  'PLATFORM_ROLE_GRANTED',
  'WEBHOOK_RETRIED',
  'CUSTOMER_DATA_VIEWED',
  'CUSTOMER_DATA_REVEALED',
  'AUTH_POLICY_RESET',
  'SAML_CONFIG_RESET',
  'SAML_DISABLED',
] as const
