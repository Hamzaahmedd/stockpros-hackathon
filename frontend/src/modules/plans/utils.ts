import type { PlanTier } from '../auth/types'

/** PRO and TEAM both unlock the full paid feature set (mirrors backend `hasPaidPlan`). */
export const isPaidPlan = (plan: PlanTier | undefined): boolean =>
  plan === 'PRO' || plan === 'TEAM'

/** Formats integer paisa as rupees, e.g. 749900 -> "Rs 7,499". */
export const formatPaisa = (paisa: number): string =>
  `Rs ${(paisa / 100).toLocaleString('en-PK')}`

/** Clamps free-typed seat input into the allowed range (NaN falls back to the minimum). */
export const clampSeats = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : min

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** "Oct 6" for a `YYYY-MM-DD` calendar day. Parsed as UTC so no time zone can shift it. */
export const formatChartDay = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

/** Whole days left until `end`, never negative. */
export const daysUntil = (end: string, now: Date = new Date()): number =>
  Math.max(Math.ceil((new Date(end).getTime() - now.getTime()) / MS_PER_DAY), 0)
