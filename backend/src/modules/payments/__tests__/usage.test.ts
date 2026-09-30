jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    user: { findUniqueOrThrow: jest.fn() },
    team: { findUniqueOrThrow: jest.fn() },
    subscription: { findUnique: jest.fn() },
    usageEvent: { count: jest.fn() },
    creditLedger: { aggregate: jest.fn() },
  },
}))

jest.mock('../../../shared/infrastructure/team-access', () => ({
  // keep the real, pure role check; only the DB-backed lookups are faked
  isTeamAdminRole: jest.requireActual(
    '../../../shared/infrastructure/team-access',
  ).isTeamAdminRole,
  getActiveMembership: jest.fn(),
}))

import { TeamRole } from '@prisma/client'
import { prisma } from '../../../shared/infrastructure/database'
import { getActiveMembership } from '../../../shared/infrastructure/team-access'
import {
  MeteredFeature,
  OVERAGE_COST_PAISA_PER_SIGNAL,
  PRO_MONTHLY_AI_SIGNALS,
  TEAM_MONTHLY_AI_SIGNALS,
} from '../constants'
import { UsageWindowSource } from '../credits'
import { CreditPool, getMyUsage } from '../usage'

const db = prisma as any

const PERIOD_START = new Date('2026-09-10T00:00:00Z')
const PERIOD_END = new Date('2026-10-10T00:00:00Z')

const asUser = (plan: string, creditBalanceInPaisa = 0) =>
  db.user.findUniqueOrThrow.mockResolvedValue({ plan, creditBalanceInPaisa })

const asMember = (
  role: TeamRole,
  monthlyCreditLimitPaisa: number | null = null,
) =>
  (getActiveMembership as jest.Mock).mockResolvedValue({
    teamId: 'team-1',
    role,
    monthlyCreditLimitPaisa,
    orgInstructions: null,
  })

beforeEach(() => {
  jest.resetAllMocks()
  ;(getActiveMembership as jest.Mock).mockResolvedValue(null)
  db.subscription.findUnique.mockResolvedValue({
    currentPeriodStart: PERIOD_START,
    currentPeriodEnd: PERIOD_END,
  })
  db.usageEvent.count.mockResolvedValue(0)
})

describe('FREE users', () => {
  it('have no monthly meter (daily quotas apply) and no lookups beyond the plan', async () => {
    asUser('FREE')

    const usage = await getMyUsage('user-1')

    expect(usage).toEqual({
      plan: 'FREE',
      metered: false,
      quota: null,
      credits: null,
      spendCap: null,
    })
    expect(db.usageEvent.count).not.toHaveBeenCalled()
  })
})

describe('PRO users', () => {
  it('report used / limit / remaining over the subscription billing cycle', async () => {
    asUser('PRO', 95_000)
    db.usageEvent.count.mockResolvedValue(212)

    const usage = await getMyUsage('user-1')

    expect(usage.metered).toBe(true)
    expect(usage.quota).toEqual({
      limit: PRO_MONTHLY_AI_SIGNALS,
      used: 212,
      remaining: 88,
      windowStart: PERIOD_START,
      windowEnd: PERIOD_END,
      windowSource: UsageWindowSource.SUBSCRIPTION_PERIOD,
    })
  })

  it('counts exactly what enforcement counts: this user, AI-signal features, inside the window', async () => {
    asUser('PRO')
    await getMyUsage('user-1')

    expect(db.usageEvent.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        feature: {
          in: [MeteredFeature.AI_FORECAST, MeteredFeature.AI_DECISION],
        },
        createdAt: { gte: PERIOD_START },
      },
    })
  })

  it('never shows negative remaining when usage has overshot the allowance', async () => {
    asUser('PRO')
    db.usageEvent.count.mockResolvedValue(PRO_MONTHLY_AI_SIGNALS + 7)

    const { quota } = await getMyUsage('user-1')

    expect(quota?.remaining).toBe(0)
    expect(quota?.used).toBe(PRO_MONTHLY_AI_SIGNALS + 7)
  })

  it('shows their own credit balance, how many signals it buys, and that they can top up', async () => {
    asUser('PRO', 95_000)

    const { credits, spendCap } = await getMyUsage('user-1')

    expect(credits).toEqual({
      pool: CreditPool.USER,
      balanceInPaisa: 95_000,
      costPerSignalPaisa: OVERAGE_COST_PAISA_PER_SIGNAL,
      signalsAvailable: 19, // 95,000 / 5,000
      canTopUp: true,
    })
    expect(spendCap).toBeNull()
    expect(db.team.findUniqueOrThrow).not.toHaveBeenCalled()
  })

  it('rounds signalsAvailable down — a partial signal cannot be bought', async () => {
    asUser('PRO', 12_499)
    const { credits } = await getMyUsage('user-1')
    expect(credits?.signalsAvailable).toBe(2)
  })

  it('falls back to the UTC calendar month when there is no confirmed billing period (Bypass Mode)', async () => {
    asUser('PRO')
    db.subscription.findUnique.mockResolvedValue(null)

    const { quota } = await getMyUsage('user-1')

    expect(quota?.windowSource).toBe(UsageWindowSource.CALENDAR_MONTH)
    expect(quota?.windowStart.getUTCDate()).toBe(1)
    expect(quota?.windowEnd?.getUTCDate()).toBe(1)
    expect(quota!.windowEnd!.getTime()).toBeGreaterThan(
      quota!.windowStart.getTime(),
    )
  })

  it('keeps reporting the lapsed window during a grace period (end already in the past)', async () => {
    asUser('PRO')
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000)
    db.subscription.findUnique.mockResolvedValue({
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: past,
    })

    const { quota } = await getMyUsage('user-1')

    expect(quota?.windowStart).toEqual(PERIOD_START)
    expect(quota?.windowEnd).toEqual(past)
  })
})

describe('TEAM members', () => {
  beforeEach(() => {
    asUser('TEAM', 1_000)
    db.team.findUniqueOrThrow.mockResolvedValue({
      creditBalanceInPaisa: 250_000,
    })
  })

  it('get the 375 seat allowance measured over the team subscription', async () => {
    asMember(TeamRole.MEMBER)
    db.usageEvent.count.mockResolvedValue(300)

    const { quota } = await getMyUsage('user-1')

    expect(quota?.limit).toBe(TEAM_MONTHLY_AI_SIGNALS)
    expect(quota?.remaining).toBe(TEAM_MONTHLY_AI_SIGNALS - 300)
    expect(db.subscription.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: 'team-1' } }),
    )
  })

  it('show the shared pool (not their own balance), and only admins can top it up', async () => {
    asMember(TeamRole.MEMBER)
    const member = await getMyUsage('user-1')
    expect(member.credits).toMatchObject({
      pool: CreditPool.TEAM,
      balanceInPaisa: 250_000,
      signalsAvailable: 50,
      canTopUp: false,
    })

    asMember(TeamRole.ADMIN)
    expect((await getMyUsage('user-1')).credits?.canTopUp).toBe(true)
    asMember(TeamRole.OWNER)
    expect((await getMyUsage('user-1')).credits?.canTopUp).toBe(true)
  })

  it('report the remaining spend cap when one is set', async () => {
    asMember(TeamRole.MEMBER, 20_000)
    db.creditLedger.aggregate.mockResolvedValue({
      _sum: { amountPaisa: -15_000 },
    })

    const { spendCap } = await getMyUsage('user-1')

    expect(spendCap).toEqual({
      monthlyLimitPaisa: 20_000,
      spentPaisa: 15_000,
      remainingPaisa: 5_000,
    })
    expect(db.creditLedger.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          teamId: 'team-1',
          type: 'OVERAGE_CONSUMPTION',
          createdAt: { gte: PERIOD_START },
        }),
      }),
    )
  })

  it('treat no consumption yet as zero spent, and clamp remaining at zero when at the cap', async () => {
    asMember(TeamRole.MEMBER, 20_000)
    db.creditLedger.aggregate.mockResolvedValue({ _sum: { amountPaisa: null } })
    expect((await getMyUsage('user-1')).spendCap).toMatchObject({
      spentPaisa: 0,
      remainingPaisa: 20_000,
    })

    db.creditLedger.aggregate.mockResolvedValue({
      _sum: { amountPaisa: -25_000 },
    })
    expect((await getMyUsage('user-1')).spendCap?.remainingPaisa).toBe(0)
  })

  it('omit the spend cap entirely when the member has none', async () => {
    asMember(TeamRole.MEMBER, null)
    expect((await getMyUsage('user-1')).spendCap).toBeNull()
    expect(db.creditLedger.aggregate).not.toHaveBeenCalled()
  })
})

describe('a stale TEAM plan without an active workspace', () => {
  it('is treated as an individual (personal allowance and balance), like enforcement does', async () => {
    asUser('TEAM', 30_000)
    ;(getActiveMembership as jest.Mock).mockResolvedValue(null)

    const usage = await getMyUsage('user-1')

    expect(usage.quota?.limit).toBe(PRO_MONTHLY_AI_SIGNALS)
    expect(usage.credits).toMatchObject({
      pool: CreditPool.USER,
      balanceInPaisa: 30_000,
    })
  })
})
