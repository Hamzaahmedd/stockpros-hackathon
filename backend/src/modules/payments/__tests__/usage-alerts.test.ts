jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    usageAlert: { createMany: jest.fn(), deleteMany: jest.fn() },
    creditLedger: { aggregate: jest.fn() },
  },
}))

jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('../../notifications/public', () => ({
  enqueueUsageAlertEmail: jest.fn(),
}))

jest.mock('../usage', () => ({ getMyUsage: jest.fn() }))

import config from '@/config'
import { TeamRole, UsageAlertKind } from '@prisma/client'
import { prisma } from '../../../shared/infrastructure/database'
import { logger } from '../../../shared/infrastructure/logger'
import { enqueueUsageAlertEmail } from '../../notifications/public'
import {
  OVERAGE_COST_PAISA_PER_SIGNAL,
  PRO_MONTHLY_AI_SIGNALS,
} from '../constants'
import { UsageSource, type MeterResult } from '../credits'
import {
  notifyUsageThresholds,
  resetLowBalanceAlert,
  setUsageAlertsEnabled,
} from '../usage-alerts'
import { getMyUsage } from '../usage'

const db = prisma as any
const enqueue = enqueueUsageAlertEmail as jest.Mock

const WINDOW_START = new Date('2030-09-10T00:00:00Z')
const WINDOW_END = new Date('2030-10-10T00:00:00Z')

const individual = { userId: 'user-1', membership: null }

const base = (
  used: number,
  windowEnd: Date | null = WINDOW_END,
): MeterResult => ({
  source: UsageSource.BASE,
  costPaisa: 0,
  quota: {
    used,
    limit: PRO_MONTHLY_AI_SIGNALS,
    windowStart: WINDOW_START,
    windowEnd,
  },
})

const credit = (): MeterResult => ({
  source: UsageSource.CREDIT,
  costPaisa: OVERAGE_COST_PAISA_PER_SIGNAL,
  quota: {
    used: PRO_MONTHLY_AI_SIGNALS + 1,
    limit: PRO_MONTHLY_AI_SIGNALS,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
  },
})

const asUser = (overrides: Record<string, unknown> = {}) =>
  db.user.findUnique.mockResolvedValue({
    email: 'pro@example.com',
    displayName: 'Hamza',
    usageAlertsEnabled: true,
    creditBalanceInPaisa: 95_000,
    monthlyCreditLimitPaisa: null,
    ...overrides,
  })

const sentKinds = (): UsageAlertKind[] =>
  enqueue.mock.calls.map(([payload]) => payload.kind)

beforeEach(() => {
  jest.resetAllMocks()
  asUser()
  db.usageAlert.createMany.mockResolvedValue({ count: 1 })
  db.creditLedger.aggregate.mockResolvedValue({ _sum: { amountPaisa: null } })
})

describe('allowance warnings (free signals)', () => {
  it('does nothing — not even a query — for an ordinary signal below 80%', async () => {
    await notifyUsageThresholds(individual, base(100))

    expect(db.user.findUnique).not.toHaveBeenCalled()
    expect(db.usageAlert.createMany).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('warns once at 80% (240 of 300) with the numbers and a link to the usage page', async () => {
    await notifyUsageThresholds(individual, base(240))

    expect(db.usageAlert.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user-1',
          kind: UsageAlertKind.QUOTA_80,
          windowStart: WINDOW_START,
        },
      ],
      skipDuplicates: true,
    })
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue).toHaveBeenCalledWith({
      to: 'pro@example.com',
      userId: 'user-1',
      kind: UsageAlertKind.QUOTA_80,
      userName: 'Hamza',
      usedSignals: 240,
      includedSignals: 300,
      resetsOn: 'Oct 10, 2030',
      creditBalance: 'Rs 950',
      usageUrl: `${config.server.frontendUrl}/usage`,
    })
  })

  it('does not warn on the signals either side of the 80% line', async () => {
    await notifyUsageThresholds(individual, base(239))
    await notifyUsageThresholds(individual, base(241))
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('warns when the included signals are used up (300 of 300)', async () => {
    await notifyUsageThresholds(individual, base(300))
    expect(sentKinds()).toEqual([UsageAlertKind.QUOTA_EXHAUSTED])
  })

  it('says "your next cycle" when the reset date is unknown', async () => {
    await notifyUsageThresholds(individual, base(240, null))
    expect(enqueue.mock.calls[0][0].resetsOn).toBe('your next cycle')
  })
})

describe('credit warnings (paid signals)', () => {
  it('warns when the balance cannot pay for 5 more signals', async () => {
    asUser({ creditBalanceInPaisa: 5 * OVERAGE_COST_PAISA_PER_SIGNAL - 1 })

    await notifyUsageThresholds(individual, credit())

    expect(sentKinds()).toEqual([UsageAlertKind.LOW_BALANCE])
    expect(enqueue.mock.calls[0][0].creditBalance).toBe('Rs 249.99')
  })

  it('stays quiet while the balance still covers 5 signals', async () => {
    asUser({ creditBalanceInPaisa: 5 * OVERAGE_COST_PAISA_PER_SIGNAL })
    await notifyUsageThresholds(individual, credit())
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('warns at 90% of a personal spending limit, naming what was spent', async () => {
    asUser({ monthlyCreditLimitPaisa: 50_000 })
    db.creditLedger.aggregate.mockResolvedValue({
      _sum: { amountPaisa: -45_000 },
    })

    await notifyUsageThresholds(individual, credit())

    expect(sentKinds()).toEqual([UsageAlertKind.CAP_90])
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      spendLimit: 'Rs 500',
      spentSoFar: 'Rs 450',
    })
    // Only this user's personal draws count towards their own limit.
    expect(db.creditLedger.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', teamId: null }),
      }),
    )
  })

  it('stays quiet below 90% of the limit, and never queries the ledger without one', async () => {
    asUser({ monthlyCreditLimitPaisa: 50_000 })
    db.creditLedger.aggregate.mockResolvedValue({
      _sum: { amountPaisa: -44_999 },
    })
    await notifyUsageThresholds(individual, credit())
    expect(enqueue).not.toHaveBeenCalled()

    jest.clearAllMocks()
    asUser({ monthlyCreditLimitPaisa: null })
    await notifyUsageThresholds(individual, credit())
    expect(db.creditLedger.aggregate).not.toHaveBeenCalled()
  })

  it('sends both warnings when one signal trips both', async () => {
    asUser({ creditBalanceInPaisa: 10_000, monthlyCreditLimitPaisa: 50_000 })
    db.creditLedger.aggregate.mockResolvedValue({
      _sum: { amountPaisa: -48_000 },
    })

    await notifyUsageThresholds(individual, credit())

    expect(sentKinds()).toEqual([
      UsageAlertKind.LOW_BALANCE,
      UsageAlertKind.CAP_90,
    ])
  })
})

describe('who gets emailed, and how often', () => {
  it('never emails workspace members: their allowance and pool belong to the workspace', async () => {
    const member = {
      userId: 'user-1',
      membership: {
        teamId: 'team-1',
        role: TeamRole.MEMBER,
        monthlyCreditLimitPaisa: null,
        orgInstructions: null,
      },
    }

    await notifyUsageThresholds(member, base(300))

    expect(db.user.findUnique).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('respects the opt-out: nothing is claimed or sent', async () => {
    asUser({ usageAlertsEnabled: false })

    await notifyUsageThresholds(individual, base(240))

    expect(db.usageAlert.createMany).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('does nothing when the user no longer exists', async () => {
    db.user.findUnique.mockResolvedValue(null)
    await notifyUsageThresholds(individual, base(240))
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('sends a warning only to the request that claimed it; a duplicate stays silent', async () => {
    db.usageAlert.createMany.mockResolvedValue({ count: 0 })

    await notifyUsageThresholds(individual, base(240))

    expect(db.usageAlert.createMany).toHaveBeenCalledTimes(1)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('logs the user id only, never the address', async () => {
    await notifyUsageThresholds(individual, base(240))

    const lines = (logger.info as jest.Mock).mock.calls.map(([line]) => line)
    expect(lines).toEqual(['[UsageAlert] Queued QUOTA_80 warning user=user-1'])
    expect(JSON.stringify(lines)).not.toContain('pro@example.com')
  })
})

describe('failures never reach the AI request', () => {
  it('swallows an enqueue failure and logs a warning', async () => {
    enqueue.mockRejectedValue(new Error('redis down'))

    await expect(
      notifyUsageThresholds(individual, base(240)),
    ).resolves.toBeUndefined()

    expect((logger.warn as jest.Mock).mock.calls[0][0]).toContain(
      'Failed to evaluate warnings user=user-1: redis down',
    )
  })

  it('copes with a non-Error rejection', async () => {
    db.user.findUnique.mockRejectedValue('boom')

    await expect(
      notifyUsageThresholds(individual, base(240)),
    ).resolves.toBeUndefined()

    expect((logger.warn as jest.Mock).mock.calls[0][0]).toContain('boom')
  })
})

describe('resetLowBalanceAlert', () => {
  it("clears only that user's low-balance warning, so the next dip can warn again", async () => {
    const tx = { usageAlert: { deleteMany: jest.fn() } }

    await resetLowBalanceAlert(tx as any, 'user-1')

    expect(tx.usageAlert.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', kind: UsageAlertKind.LOW_BALANCE },
    })
  })
})

describe('setUsageAlertsEnabled', () => {
  it("updates the caller's own row and returns the refreshed usage summary", async () => {
    ;(getMyUsage as jest.Mock).mockResolvedValue({ alertsEnabled: false })

    const summary = await setUsageAlertsEnabled('user-1', false)

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { usageAlertsEnabled: false },
    })
    expect(summary).toEqual({ alertsEnabled: false })
  })
})
