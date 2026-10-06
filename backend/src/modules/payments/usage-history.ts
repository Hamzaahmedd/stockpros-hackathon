import { PlanTier, Prisma } from '@prisma/client'
import { BadRequestError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import {
  getActiveMembership,
  isTeamAdminRole,
  type ActiveMembership,
} from '../../shared/infrastructure/team-access'
import {
  DEFAULT_USAGE_TIME_ZONE,
  MeteredFeature,
  SUBSCRIPTION_PERIOD_MS,
  UsageHistoryRange,
  UsageHistoryScope,
} from './constants'
import {
  resolveUsageWindow,
  UsageWindowSource,
  type MeterActor,
  type UsageWindow,
} from './credits'

export interface UsageHistoryDay {
  /** Calendar day in the requested time zone, `YYYY-MM-DD`. */
  date: string
  signals: number
  creditSpentPaisa: number
}

export interface UsageHistoryFeature {
  feature: MeteredFeature
  signals: number
  creditSpentPaisa: number
}

export interface UsageHistory {
  plan: PlanTier
  /** False for FREE: daily quotas apply instead of a monthly cycle. */
  metered: boolean
  /** Null when not metered. */
  scope: UsageHistoryScope | null
  range: UsageHistoryRange
  timezone: string
  window: {
    start: Date
    end: Date | null
    source: UsageWindowSource
  } | null
  totals: { signals: number; creditSpentPaisa: number }
  /** One entry per calendar day in the window so far, zero-filled. */
  daily: UsageHistoryDay[]
  /** One entry per metered feature, in a fixed order. */
  byFeature: UsageHistoryFeature[]
}

interface UsageRow {
  day: string
  feature: string
  signals: number
  spent: number
}

const AI_SIGNAL_FEATURES: MeteredFeature[] = Object.values(MeteredFeature)

/** A cycle plus a grace period is well under this; it only bounds the zero-fill loop. */
const MAX_DAILY_BUCKETS = 93

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** PostgreSQL error code for an unrecognised time zone name. */
const PG_INVALID_PARAMETER_VALUE = '22023'

const dayFormatters = new Map<string, Intl.DateTimeFormat>()

/** The calendar day `instant` falls on in `timeZone`, as `YYYY-MM-DD`. */
const localDay = (instant: Date, timeZone: string): string => {
  let formatter = dayFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    dayFormatters.set(timeZone, formatter)
  }
  return formatter.format(instant)
}

/** Calendar arithmetic on a `YYYY-MM-DD` string, independent of any time zone. */
const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10)

/**
 * The cycle before `current`. A subscription only stores its current period,
 * so the previous one is assumed to be the same length and to end where this
 * one starts; the calendar-month fallback is exact.
 */
export function resolvePreviousWindow(current: UsageWindow): UsageWindow {
  if (current.source === UsageWindowSource.CALENDAR_MONTH) {
    return {
      start: new Date(
        Date.UTC(
          current.start.getUTCFullYear(),
          current.start.getUTCMonth() - 1,
          1,
        ),
      ),
      end: current.start,
      source: current.source,
    }
  }
  const length = current.end
    ? current.end.getTime() - current.start.getTime()
    : SUBSCRIPTION_PERIOD_MS
  return {
    start: new Date(current.start.getTime() - length),
    end: current.start,
    source: current.source,
  }
}

interface ResolvedScope {
  scope: UsageHistoryScope
  /** SQL predicate over `usage_events`; every branch names its owner explicitly. */
  filter: Prisma.Sql
}

/**
 * Who the history is about. A workspace owner/admin sees the whole workspace;
 * a plain member sees only their own events inside that workspace; everyone
 * else (Pro, or a stale TEAM plan with no active workspace) sees their own,
 * which is what the meter counts too.
 */
function resolveScope(
  userId: string,
  membership: ActiveMembership | null,
): ResolvedScope {
  if (membership && isTeamAdminRole(membership.role)) {
    return {
      scope: UsageHistoryScope.TEAM,
      filter: Prisma.sql`team_id = ${membership.teamId}::uuid`,
    }
  }
  if (membership) {
    return {
      scope: UsageHistoryScope.USER,
      filter: Prisma.sql`user_id = ${userId}::uuid AND team_id = ${membership.teamId}::uuid`,
    }
  }
  return {
    scope: UsageHistoryScope.USER,
    filter: Prisma.sql`user_id = ${userId}::uuid`,
  }
}

const isInvalidTimeZoneError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2010' &&
  (error.meta as { code?: string } | undefined)?.code ===
    PG_INVALID_PARAMETER_VALUE

async function queryDailyUsage(
  filter: Prisma.Sql,
  from: Date,
  until: Date | null,
  timeZone: string,
): Promise<UsageRow[]> {
  const upperBound = until
    ? Prisma.sql`AND created_at < ${until.toISOString()}::timestamptz`
    : Prisma.empty
  try {
    return await prisma.$queryRaw<UsageRow[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', created_at AT TIME ZONE ${timeZone}::text), 'YYYY-MM-DD') AS day,
             feature,
             COUNT(*)::int AS signals,
             COALESCE(SUM(cost_paisa), 0)::int AS spent
      FROM usage_events
      WHERE ${filter}
        AND feature IN (${Prisma.join(AI_SIGNAL_FEATURES)})
        AND created_at >= ${from.toISOString()}::timestamptz
        ${upperBound}
      GROUP BY 1, 2
      ORDER BY 1`)
  } catch (error) {
    if (isInvalidTimeZoneError(error)) {
      throw new BadRequestError(`Unsupported time zone: ${timeZone}`)
    }
    throw error
  }
}

const emptyHistory = (
  plan: PlanTier,
  range: UsageHistoryRange,
  timezone: string,
): UsageHistory => ({
  plan,
  metered: false,
  scope: null,
  range,
  timezone,
  window: null,
  totals: { signals: 0, creditSpentPaisa: 0 },
  daily: [],
  byFeature: AI_SIGNAL_FEATURES.map((feature) => ({
    feature,
    signals: 0,
    creditSpentPaisa: 0,
  })),
})

/**
 * Daily AI-signal usage for one billing cycle, bucketed by calendar day in the
 * caller's time zone (`date_trunc` in PostgreSQL, so a signal at 23:30 local
 * counts for that local day, not the UTC one). Counts the same metered
 * features and the same window as the quota meter and enforcement.
 *
 * `current` has no upper bound, mirroring enforcement during a grace period;
 * `previous` is bounded by the start of the current cycle.
 */
export async function getUsageHistory(
  userId: string,
  range: UsageHistoryRange = UsageHistoryRange.CURRENT,
  timeZone: string = DEFAULT_USAGE_TIME_ZONE,
  now: Date = new Date(),
): Promise<UsageHistory> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true },
  })
  if (user.plan === PlanTier.FREE) {
    return emptyHistory(user.plan, range, timeZone)
  }

  const membership = await getActiveMembership(userId)
  const actor: MeterActor = { userId, membership }
  const currentWindow = await resolveUsageWindow(actor, now)
  const isCurrent = range === UsageHistoryRange.CURRENT
  const window = isCurrent
    ? currentWindow
    : resolvePreviousWindow(currentWindow)

  const { scope, filter } = resolveScope(userId, membership)
  const rows = await queryDailyUsage(
    filter,
    window.start,
    isCurrent ? null : window.end,
    timeZone,
  )

  const byDay = new Map<string, UsageHistoryDay>()
  const byFeature = new Map<string, UsageHistoryFeature>(
    AI_SIGNAL_FEATURES.map((feature) => [
      feature,
      { feature, signals: 0, creditSpentPaisa: 0 },
    ]),
  )
  for (const row of rows) {
    const day = byDay.get(row.day) ?? {
      date: row.day,
      signals: 0,
      creditSpentPaisa: 0,
    }
    day.signals += row.signals
    day.creditSpentPaisa += row.spent
    byDay.set(row.day, day)

    const feature = byFeature.get(row.feature)
    if (feature) {
      feature.signals += row.signals
      feature.creditSpentPaisa += row.spent
    }
  }

  // The current cycle runs up to today; a past one runs to its last instant.
  const lastDay = localDay(
    isCurrent ? now : new Date((window.end as Date).getTime() - 1),
    timeZone,
  )
  const daily: UsageHistoryDay[] = []
  for (
    let day = localDay(window.start, timeZone);
    day <= lastDay && daily.length < MAX_DAILY_BUCKETS;
    day = addDays(day, 1)
  ) {
    daily.push(byDay.get(day) ?? { date: day, signals: 0, creditSpentPaisa: 0 })
  }

  return {
    plan: user.plan,
    metered: true,
    scope,
    range,
    timezone: timeZone,
    window: { start: window.start, end: window.end, source: window.source },
    totals: {
      signals: rows.reduce((sum, row) => sum + row.signals, 0),
      creditSpentPaisa: rows.reduce((sum, row) => sum + row.spent, 0),
    },
    daily,
    byFeature: [...byFeature.values()],
  }
}
