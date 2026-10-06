jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    user: { findUniqueOrThrow: jest.fn() },
    subscription: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  },
}))

jest.mock('../../../shared/infrastructure/team-access', () => ({
  // keep the real, pure helpers (roles, permissions); only the DB-backed lookups are faked
  ...jest.requireActual('../../../shared/infrastructure/team-access'),
  getActiveMembership: jest.fn(),
}))

import { Prisma, TeamRole } from '@prisma/client'
import { prisma } from '../../../shared/infrastructure/database'
import { getActiveMembership } from '../../../shared/infrastructure/team-access'
import {
  MeteredFeature,
  UsageHistoryRange,
  UsageHistoryScope,
} from '../constants'
import { UsageWindowSource } from '../credits'
import { getUsageHistory, resolvePreviousWindow } from '../usage-history'

const db = prisma as any

const PERIOD_START = new Date('2026-09-10T00:00:00Z')
const PERIOD_END = new Date('2026-10-10T00:00:00Z')
const NOW = new Date('2026-09-13T12:00:00Z')

const asUser = (plan: string) =>
  db.user.findUniqueOrThrow.mockResolvedValue({ plan })

const asMember = (role: TeamRole) =>
  (getActiveMembership as jest.Mock).mockResolvedValue({
    teamId: 'team-1',
    role,
    monthlyCreditLimitPaisa: null,
    orgInstructions: null,
  })

const row = (
  day: string,
  feature: MeteredFeature,
  signals: number,
  spent = 0,
) => ({ day, feature, signals, spent })

/** The Prisma.Sql handed to $queryRaw: its text and bound values. */
const lastQuery = (): { sql: string; values: unknown[] } => {
  const call = db.$queryRaw.mock.calls.at(-1)[0] as Prisma.Sql
  return { sql: call.text, values: call.values }
}

beforeEach(() => {
  jest.resetAllMocks()
  ;(getActiveMembership as jest.Mock).mockResolvedValue(null)
  db.subscription.findUnique.mockResolvedValue({
    currentPeriodStart: PERIOD_START,
    currentPeriodEnd: PERIOD_END,
  })
  db.$queryRaw.mockResolvedValue([])
})

describe('FREE users', () => {
  it('get metered:false with no history and never hit the usage table', async () => {
    asUser('FREE')

    const history = await getUsageHistory('user-1')

    expect(history).toMatchObject({
      plan: 'FREE',
      metered: false,
      scope: null,
      window: null,
      totals: { signals: 0, creditSpentPaisa: 0 },
      daily: [],
    })
    expect(history.byFeature.map((f) => f.feature)).toEqual([
      MeteredFeature.AI_FORECAST,
      MeteredFeature.AI_DECISION,
    ])
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })
})

describe('empty windows', () => {
  it('zero-fills every day from the cycle start through today', async () => {
    asUser('PRO')

    const history = await getUsageHistory(
      'user-1',
      UsageHistoryRange.CURRENT,
      'UTC',
      NOW,
    )

    expect(history.daily.map((d) => d.date)).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ])
    expect(history.daily.every((d) => d.signals === 0)).toBe(true)
    expect(history.totals).toEqual({ signals: 0, creditSpentPaisa: 0 })
    expect(history.window).toEqual({
      start: PERIOD_START,
      end: PERIOD_END,
      source: UsageWindowSource.SUBSCRIPTION_PERIOD,
    })
  })
})

describe('daily bucketing', () => {
  it('merges features per day, keeps gaps at zero, and totals both measures', async () => {
    asUser('PRO')
    db.$queryRaw.mockResolvedValue([
      row('2026-09-10', MeteredFeature.AI_FORECAST, 3),
      row('2026-09-10', MeteredFeature.AI_DECISION, 2, 10_000),
      row('2026-09-13', MeteredFeature.AI_FORECAST, 1, 5_000),
    ])

    const history = await getUsageHistory(
      'user-1',
      UsageHistoryRange.CURRENT,
      'UTC',
      NOW,
    )

    expect(history.daily).toEqual([
      { date: '2026-09-10', signals: 5, creditSpentPaisa: 10_000 },
      { date: '2026-09-11', signals: 0, creditSpentPaisa: 0 },
      { date: '2026-09-12', signals: 0, creditSpentPaisa: 0 },
      { date: '2026-09-13', signals: 1, creditSpentPaisa: 5_000 },
    ])
    expect(history.byFeature).toEqual([
      { feature: 'ai_forecast', signals: 4, creditSpentPaisa: 5_000 },
      { feature: 'ai_decision', signals: 2, creditSpentPaisa: 10_000 },
    ])
    expect(history.totals).toEqual({ signals: 6, creditSpentPaisa: 15_000 })
  })

  it('ignores rows for features that are not metered', async () => {
    asUser('PRO')
    db.$queryRaw.mockResolvedValue([row('2026-09-10', 'search' as any, 4)])

    const history = await getUsageHistory(
      'user-1',
      UsageHistoryRange.CURRENT,
      'UTC',
      NOW,
    )

    expect(history.byFeature.every((f) => f.signals === 0)).toBe(true)
  })
})

describe('time zones', () => {
  it('cuts the buckets in the requested zone, passed to date_trunc as a bound parameter', async () => {
    asUser('PRO')

    const history = await getUsageHistory(
      'user-1',
      UsageHistoryRange.CURRENT,
      'Asia/Karachi',
      NOW,
    )

    const { sql, values } = lastQuery()
    expect(sql).toContain("date_trunc('day', created_at AT TIME ZONE $1::text)")
    expect(values[0]).toBe('Asia/Karachi')
    expect(history.timezone).toBe('Asia/Karachi')
  })

  it('starts the first bucket on the local calendar day of the cycle start', async () => {
    asUser('PRO')
    // 22:00 UTC on the 9th is already the 10th in Karachi (UTC+5).
    db.subscription.findUnique.mockResolvedValue({
      currentPeriodStart: new Date('2026-09-09T22:00:00Z'),
      currentPeriodEnd: PERIOD_END,
    })

    const utc = await getUsageHistory(
      'user-1',
      UsageHistoryRange.CURRENT,
      'UTC',
      NOW,
    )
    const karachi = await getUsageHistory(
      'user-1',
      UsageHistoryRange.CURRENT,
      'Asia/Karachi',
      NOW,
    )

    expect(utc.daily[0].date).toBe('2026-09-09')
    expect(karachi.daily[0].date).toBe('2026-09-10')
  })

  it("ends today's bucket on the caller's local day, not the UTC one", async () => {
    asUser('PRO')
    // 21:00 UTC on the 13th is already the 14th in Karachi.
    const lateEvening = new Date('2026-09-13T21:00:00Z')

    const utc = await getUsageHistory(
      'user-1',
      UsageHistoryRange.CURRENT,
      'UTC',
      lateEvening,
    )
    const karachi = await getUsageHistory(
      'user-1',
      UsageHistoryRange.CURRENT,
      'Asia/Karachi',
      lateEvening,
    )

    expect(utc.daily.at(-1)?.date).toBe('2026-09-13')
    expect(karachi.daily.at(-1)?.date).toBe('2026-09-14')
  })

  it('defaults to UTC', async () => {
    asUser('PRO')
    const history = await getUsageHistory('user-1')
    expect(history.timezone).toBe('UTC')
    expect(lastQuery().values[0]).toBe('UTC')
  })

  it('turns a time zone PostgreSQL rejects into a 400', async () => {
    asUser('PRO')
    db.$queryRaw.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('bad tz', {
        code: 'P2010',
        clientVersion: 'test',
        meta: { code: '22023' },
      }),
    )

    await expect(
      getUsageHistory('user-1', UsageHistoryRange.CURRENT, 'Mars/Olympus', NOW),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('lets any other database failure through unchanged', async () => {
    asUser('PRO')
    db.$queryRaw.mockRejectedValue(new Error('connection lost'))

    await expect(getUsageHistory('user-1')).rejects.toThrow('connection lost')
  })
})

describe('scoping (who the numbers are about)', () => {
  it('shows an individual Pro user their own events only', async () => {
    asUser('PRO')

    const history = await getUsageHistory('user-1', undefined, 'UTC', NOW)

    expect(history.scope).toBe(UsageHistoryScope.USER)
    const { sql, values } = lastQuery()
    expect(sql).toContain('user_id = $')
    expect(sql).not.toContain('team_id')
    expect(values).toContain('user-1')
  })

  it('shows a plain team member only their own events inside the workspace', async () => {
    asUser('TEAM')
    asMember(TeamRole.MEMBER)

    const history = await getUsageHistory('member-1', undefined, 'UTC', NOW)

    expect(history.scope).toBe(UsageHistoryScope.USER)
    const { sql, values } = lastQuery()
    expect(sql).toContain('user_id = $')
    expect(sql).toContain('team_id = $')
    expect(values).toEqual(expect.arrayContaining(['member-1', 'team-1']))
  })

  it.each([TeamRole.OWNER, TeamRole.ADMIN])(
    'aggregates the whole workspace for a team %s',
    async (role) => {
      asUser('TEAM')
      asMember(role)

      const history = await getUsageHistory('admin-1', undefined, 'UTC', NOW)

      expect(history.scope).toBe(UsageHistoryScope.TEAM)
      const { sql, values } = lastQuery()
      expect(sql).toContain('team_id = $')
      expect(sql).not.toContain('user_id')
      expect(values).toContain('team-1')
      expect(values).not.toContain('admin-1')
    },
  )

  it('treats a stale TEAM plan without a workspace as an individual', async () => {
    asUser('TEAM')

    const history = await getUsageHistory('user-1', undefined, 'UTC', NOW)

    expect(history.scope).toBe(UsageHistoryScope.USER)
    expect(lastQuery().sql).not.toContain('team_id')
  })

  it('only ever counts the metered AI features', async () => {
    asUser('PRO')
    await getUsageHistory('user-1', undefined, 'UTC', NOW)
    expect(lastQuery().values).toEqual(
      expect.arrayContaining([
        MeteredFeature.AI_FORECAST,
        MeteredFeature.AI_DECISION,
      ]),
    )
  })
})

describe('the previous cycle', () => {
  it('is bounded by the start of the current cycle and fills its whole span', async () => {
    asUser('PRO')

    const history = await getUsageHistory(
      'user-1',
      UsageHistoryRange.PREVIOUS,
      'UTC',
      NOW,
    )

    // Current cycle is 30 days, so the previous one is 2026-08-11 .. 2026-09-10.
    expect(history.window?.start).toEqual(new Date('2026-08-11T00:00:00Z'))
    expect(history.window?.end).toEqual(PERIOD_START)
    expect(history.daily[0].date).toBe('2026-08-11')
    expect(history.daily.at(-1)?.date).toBe('2026-09-09')
    expect(lastQuery().sql).toContain('created_at <')
  })

  it('leaves the current cycle open-ended, as enforcement does', async () => {
    asUser('PRO')
    await getUsageHistory('user-1', UsageHistoryRange.CURRENT, 'UTC', NOW)
    expect(lastQuery().sql).not.toContain('created_at <')
  })
})

describe('resolvePreviousWindow', () => {
  it('steps back one calendar month for the Bypass-Mode fallback', () => {
    const previous = resolvePreviousWindow({
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-02-01T00:00:00Z'),
      source: UsageWindowSource.CALENDAR_MONTH,
    })

    expect(previous.start).toEqual(new Date('2025-12-01T00:00:00Z'))
    expect(previous.end).toEqual(new Date('2026-01-01T00:00:00Z'))
  })

  it('assumes a 30-day cycle when the subscription has no end date', () => {
    const previous = resolvePreviousWindow({
      start: new Date('2026-09-10T00:00:00Z'),
      end: null,
      source: UsageWindowSource.SUBSCRIPTION_PERIOD,
    })

    expect(previous.start).toEqual(new Date('2026-08-11T00:00:00Z'))
  })
})
