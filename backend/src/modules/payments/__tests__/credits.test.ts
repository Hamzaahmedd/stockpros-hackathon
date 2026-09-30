jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    subscription: { findUnique: jest.fn() },
    usageEvent: { count: jest.fn(), create: jest.fn() },
    creditLedger: { aggregate: jest.fn(), create: jest.fn() },
    team: { updateMany: jest.fn() },
    user: { updateMany: jest.fn() },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  },
}))

import { CreditLedgerType, TeamRole } from '@prisma/client'
import { OverageReason, OverageRequiredError } from '../../../shared/errors'
import { prisma } from '../../../shared/infrastructure/database'
import type { ActiveMembership } from '../../../shared/infrastructure/team-access'
import {
  MeteredFeature,
  OVERAGE_COST_PAISA_PER_SIGNAL,
  PRO_MONTHLY_AI_SIGNALS,
  TEAM_MONTHLY_AI_SIGNALS,
} from '../constants'
import {
  UsageWindowSource,
  resolveUsageWindow,
  consumeAiSignal,
  recordUsage,
  resolveUsageWindowStart,
  UsageSource,
} from '../credits'

const db = prisma as any

const membership = (
  overrides: Partial<ActiveMembership> = {},
): ActiveMembership => ({
  teamId: 'team-1',
  role: TeamRole.MEMBER,
  monthlyCreditLimitPaisa: null,
  orgInstructions: null,
  ...overrides,
})

const proActor = { userId: 'user-1', membership: null }
const teamActor = (overrides: Partial<ActiveMembership> = {}) => ({
  userId: 'user-1',
  membership: membership(overrides),
})

const tx = db

beforeEach(() => {
  jest.resetAllMocks()
  db.subscription.findUnique.mockResolvedValue(null)
  db.$transaction.mockImplementation(async (fn: any) => fn(tx))
})

describe('quota limits', () => {
  it('pins the Pro and Team (1.25x) monthly allowances', () => {
    expect(PRO_MONTHLY_AI_SIGNALS).toBe(300)
    expect(TEAM_MONTHLY_AI_SIGNALS).toBe(375)
  })
})

describe('resolveUsageWindowStart', () => {
  it("uses the subscription's current billing cycle start", async () => {
    const start = new Date('2026-09-10T00:00:00Z')
    db.subscription.findUnique.mockResolvedValue({
      currentPeriodStart: start,
      currentPeriodEnd: new Date('2026-10-10T00:00:00Z'),
    })

    await expect(resolveUsageWindowStart(proActor)).resolves.toEqual(start)
    expect(db.subscription.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    )
  })

  it('looks the team subscription up for team members', async () => {
    await resolveUsageWindowStart(teamActor())
    expect(db.subscription.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: 'team-1' } }),
    )
  })

  it('falls back to the UTC calendar month without a confirmed period', async () => {
    db.subscription.findUnique.mockResolvedValue({
      currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
      currentPeriodEnd: null,
    })

    const start = await resolveUsageWindowStart(
      proActor,
      new Date('2026-09-30T12:00:00Z'),
    )
    expect(start).toEqual(new Date('2026-09-01T00:00:00Z'))
  })
})

describe('recordUsage', () => {
  it('upper-cases the symbol and tags the team', async () => {
    await recordUsage(teamActor(), 'search', 'aapl')
    expect(db.usageEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        teamId: 'team-1',
        feature: 'search',
        symbol: 'AAPL',
        costPaisa: 0,
      },
    })
  })
})

describe('consumeAiSignal — base quota', () => {
  it('allows a Pro user under 300 signals without touching credits', async () => {
    db.usageEvent.count.mockResolvedValue(PRO_MONTHLY_AI_SIGNALS - 1)

    const result = await consumeAiSignal(
      proActor,
      MeteredFeature.AI_FORECAST,
      'aapl',
    )

    expect(result).toEqual({ source: UsageSource.BASE, costPaisa: 0 })
    // Even the free path runs as one locked transaction (no credits touched).
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.team.updateMany).not.toHaveBeenCalled()
    expect(db.user.updateMany).not.toHaveBeenCalled()
    expect(db.usageEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ symbol: 'AAPL', costPaisa: 0 }),
    })
  })

  it('counts only AI-signal features inside the billing window', async () => {
    const start = new Date('2026-09-10T00:00:00Z')
    db.subscription.findUnique.mockResolvedValue({
      currentPeriodStart: start,
      currentPeriodEnd: new Date('2026-10-10T00:00:00Z'),
    })
    db.usageEvent.count.mockResolvedValue(0)

    await consumeAiSignal(proActor, MeteredFeature.AI_DECISION)

    expect(db.usageEvent.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        feature: {
          in: [MeteredFeature.AI_FORECAST, MeteredFeature.AI_DECISION],
        },
        createdAt: { gte: start },
      },
    })
  })

  it('gives team seats 375 (not 300) before credits are needed', async () => {
    db.usageEvent.count.mockResolvedValue(PRO_MONTHLY_AI_SIGNALS)

    const result = await consumeAiSignal(
      teamActor(),
      MeteredFeature.AI_FORECAST,
    )
    expect(result.source).toBe(UsageSource.BASE)
  })
})

describe('consumeAiSignal — overage', () => {
  it('deducts from the Pro user balance and writes a negative ledger row', async () => {
    db.usageEvent.count.mockResolvedValue(PRO_MONTHLY_AI_SIGNALS)
    db.user.updateMany.mockResolvedValue({ count: 1 })

    const result = await consumeAiSignal(
      proActor,
      MeteredFeature.AI_FORECAST,
      'msft',
    )

    expect(result).toEqual({
      source: UsageSource.CREDIT,
      costPaisa: OVERAGE_COST_PAISA_PER_SIGNAL,
    })
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        creditBalanceInPaisa: { gte: OVERAGE_COST_PAISA_PER_SIGNAL },
      },
      data: {
        creditBalanceInPaisa: { decrement: OVERAGE_COST_PAISA_PER_SIGNAL },
      },
    })
    expect(db.creditLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        amountPaisa: -OVERAGE_COST_PAISA_PER_SIGNAL,
        type: CreditLedgerType.OVERAGE_CONSUMPTION,
        description: 'Overage: ai_forecast MSFT',
      }),
    })
    expect(db.usageEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        costPaisa: OVERAGE_COST_PAISA_PER_SIGNAL,
      }),
    })
  })

  it('draws team members from the team pool, not their own balance', async () => {
    db.usageEvent.count.mockResolvedValue(TEAM_MONTHLY_AI_SIGNALS)
    db.team.updateMany.mockResolvedValue({ count: 1 })

    await consumeAiSignal(teamActor(), MeteredFeature.AI_DECISION)

    expect(db.team.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'team-1',
          creditBalanceInPaisa: { gte: OVERAGE_COST_PAISA_PER_SIGNAL },
        },
      }),
    )
    expect(db.user.updateMany).not.toHaveBeenCalled()
    expect(db.creditLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teamId: 'team-1',
        description: 'Overage: ai_decision',
      }),
    })
  })

  it('rejects with OVERAGE_REQUIRED when the pool cannot cover the cost (no overdraw)', async () => {
    db.usageEvent.count.mockResolvedValue(PRO_MONTHLY_AI_SIGNALS)
    db.user.updateMany.mockResolvedValue({ count: 0 })

    const error = await consumeAiSignal(
      proActor,
      MeteredFeature.AI_FORECAST,
    ).catch((e) => e)

    expect(error).toBeInstanceOf(OverageRequiredError)
    expect(error.statusCode).toBe(403)
    expect(error.details).toEqual({
      code: 'OVERAGE_REQUIRED',
      reason: OverageReason.INSUFFICIENT_CREDITS,
      feature: MeteredFeature.AI_FORECAST,
      canTopUp: true,
    })
    expect(db.creditLedger.create).not.toHaveBeenCalled()
    expect(db.usageEvent.create).not.toHaveBeenCalled()
  })

  it('tells plain team members they cannot top up themselves', async () => {
    db.usageEvent.count.mockResolvedValue(TEAM_MONTHLY_AI_SIGNALS)
    db.team.updateMany.mockResolvedValue({ count: 0 })

    const error = await consumeAiSignal(
      teamActor({ role: TeamRole.MEMBER }),
      MeteredFeature.AI_FORECAST,
    ).catch((e) => e)
    expect(error.details.canTopUp).toBe(false)

    const adminError = await consumeAiSignal(
      teamActor({ role: TeamRole.ADMIN }),
      MeteredFeature.AI_FORECAST,
    ).catch((e) => e)
    expect(adminError.details.canTopUp).toBe(true)
  })
})

describe('consumeAiSignal — per-member spend cap', () => {
  const capped = (cap: number) => teamActor({ monthlyCreditLimitPaisa: cap })

  beforeEach(() => {
    db.usageEvent.count.mockResolvedValue(TEAM_MONTHLY_AI_SIGNALS)
    db.team.updateMany.mockResolvedValue({ count: 1 })
  })

  it('rejects once spent + cost would exceed the cap, before touching the pool', async () => {
    db.creditLedger.aggregate.mockResolvedValue({
      _sum: { amountPaisa: -(10_000 - OVERAGE_COST_PAISA_PER_SIGNAL + 1) },
    })

    const error = await consumeAiSignal(
      capped(10_000),
      MeteredFeature.AI_FORECAST,
    ).catch((e) => e)

    expect(error).toBeInstanceOf(OverageRequiredError)
    expect(error.details.reason).toBe(OverageReason.SPEND_LIMIT_REACHED)
    expect(db.team.updateMany).not.toHaveBeenCalled()
    expect(db.creditLedger.create).not.toHaveBeenCalled()
  })

  it('allows spending exactly up to the cap', async () => {
    db.creditLedger.aggregate.mockResolvedValue({
      _sum: { amountPaisa: -(10_000 - OVERAGE_COST_PAISA_PER_SIGNAL) },
    })

    const result = await consumeAiSignal(
      capped(10_000),
      MeteredFeature.AI_FORECAST,
    )
    expect(result.source).toBe(UsageSource.CREDIT)
  })

  it('treats a member with no consumption yet as having spent 0', async () => {
    db.creditLedger.aggregate.mockResolvedValue({ _sum: { amountPaisa: null } })

    const result = await consumeAiSignal(
      capped(OVERAGE_COST_PAISA_PER_SIGNAL),
      MeteredFeature.AI_FORECAST,
    )
    expect(result.source).toBe(UsageSource.CREDIT)
  })

  it('skips the cap check entirely when no limit is set', async () => {
    await consumeAiSignal(teamActor(), MeteredFeature.AI_FORECAST)
    expect(db.creditLedger.aggregate).not.toHaveBeenCalled()
  })
})

describe('atomicity: one transaction under a per-user lock', () => {
  it('takes the advisory lock before it counts usage or writes anything', async () => {
    db.usageEvent.count.mockResolvedValue(0)

    await consumeAiSignal(proActor, MeteredFeature.AI_FORECAST)

    expect(db.$executeRaw).toHaveBeenCalledTimes(1)
    const lockedAt = db.$executeRaw.mock.invocationCallOrder[0]
    expect(lockedAt).toBeLessThan(
      db.usageEvent.count.mock.invocationCallOrder[0],
    )
    expect(lockedAt).toBeLessThan(
      db.usageEvent.create.mock.invocationCallOrder[0],
    )
  })

  it('locks per user: the lock key is derived from the user id', async () => {
    db.usageEvent.count.mockResolvedValue(0)

    await consumeAiSignal(proActor, MeteredFeature.AI_FORECAST)
    await consumeAiSignal(
      { userId: 'user-2', membership: null },
      MeteredFeature.AI_FORECAST,
    )

    // Tagged-template call: [strings, ...values] — the value is the lock key.
    expect(db.$executeRaw.mock.calls.map((c: unknown[]) => c[1])).toEqual([
      'metering:user-1',
      'metering:user-2',
    ])
  })

  it('also holds the lock for the overage path (cap check + deduction are serialised too)', async () => {
    db.usageEvent.count.mockResolvedValue(PRO_MONTHLY_AI_SIGNALS)
    db.user.updateMany.mockResolvedValue({ count: 1 })

    await consumeAiSignal(proActor, MeteredFeature.AI_FORECAST)

    expect(db.$executeRaw).toHaveBeenCalledTimes(1)
    expect(db.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.user.updateMany.mock.invocationCallOrder[0],
    )
  })

  it('a rejection inside the transaction writes no usage, no ledger row and no deduction', async () => {
    db.usageEvent.count.mockResolvedValue(PRO_MONTHLY_AI_SIGNALS)
    db.user.updateMany.mockResolvedValue({ count: 0 })

    await expect(
      consumeAiSignal(proActor, MeteredFeature.AI_FORECAST),
    ).rejects.toBeInstanceOf(OverageRequiredError)

    expect(db.usageEvent.create).not.toHaveBeenCalled()
    expect(db.creditLedger.create).not.toHaveBeenCalled()
  })
})

describe('resolveUsageWindow', () => {
  it('returns the subscription period as start, end and source', async () => {
    const start = new Date('2026-09-10T00:00:00Z')
    const end = new Date('2026-10-10T00:00:00Z')
    db.subscription.findUnique.mockResolvedValue({
      currentPeriodStart: start,
      currentPeriodEnd: end,
    })

    await expect(resolveUsageWindow(proActor)).resolves.toEqual({
      start,
      end,
      source: UsageWindowSource.SUBSCRIPTION_PERIOD,
    })
  })

  it('falls back to the whole UTC calendar month, including its end, without a confirmed period', async () => {
    db.subscription.findUnique.mockResolvedValue(null)

    await expect(
      resolveUsageWindow(proActor, new Date('2026-12-15T12:00:00Z')),
    ).resolves.toEqual({
      start: new Date('2026-12-01T00:00:00Z'),
      end: new Date('2027-01-01T00:00:00Z'), // December rolls into January of the next year
      source: UsageWindowSource.CALENDAR_MONTH,
    })
  })
})
