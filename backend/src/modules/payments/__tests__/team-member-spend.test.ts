jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    subscription: { findMany: jest.fn() },
    creditLedger: { groupBy: jest.fn() },
  },
}))

import { CreditLedgerType } from '@prisma/client'
import { prisma } from '../../../shared/infrastructure/database'
import { sumTeamMemberSpend } from '../credits'

const db = prisma as any
const NOW = new Date('2026-10-15T12:00:00Z')

beforeEach(() => jest.resetAllMocks())

describe('sumTeamMemberSpend', () => {
  it('does no queries for an empty page', async () => {
    expect((await sumTeamMemberSpend([], NOW)).size).toBe(0)
    expect(db.subscription.findMany).not.toHaveBeenCalled()
    expect(db.creditLedger.groupBy).not.toHaveBeenCalled()
  })

  it('answers a page of teams with two queries, each team on its own window', async () => {
    const cycleStart = new Date('2026-10-03T00:00:00Z')
    const monthStart = new Date('2026-10-01T00:00:00Z')
    db.subscription.findMany.mockResolvedValue([
      {
        teamId: 't1',
        currentPeriodStart: cycleStart,
        currentPeriodEnd: new Date('2026-11-03T00:00:00Z'),
      },
      // No billing period: falls back to the calendar month, like enforcement.
      { teamId: 't2', currentPeriodStart: new Date(0), currentPeriodEnd: null },
    ])
    db.creditLedger.groupBy.mockResolvedValue([
      { teamId: 't1', userId: 'u1', _sum: { amountPaisa: -300 } },
      { teamId: 't1', userId: 'u2', _sum: { amountPaisa: -50 } },
      { teamId: 't2', userId: 'u1', _sum: { amountPaisa: -700 } },
      { teamId: null, userId: 'u3', _sum: { amountPaisa: -1 } },
    ])

    const spend = await sumTeamMemberSpend(['t1', 't2', 't3'], NOW)

    expect(db.subscription.findMany).toHaveBeenCalledTimes(1)
    expect(db.creditLedger.groupBy).toHaveBeenCalledTimes(1)
    expect(db.creditLedger.groupBy.mock.calls[0][0].where).toEqual({
      type: CreditLedgerType.OVERAGE_CONSUMPTION,
      OR: [
        { teamId: 't1', createdAt: { gte: cycleStart } },
        { teamId: 't2', createdAt: { gte: monthStart } },
        { teamId: 't3', createdAt: { gte: monthStart } },
      ],
    })
    expect(Object.fromEntries(spend)).toEqual({
      't1:u1': 300,
      't1:u2': 50,
      't2:u1': 700,
    })
  })

  it('treats a null sum as zero', async () => {
    db.subscription.findMany.mockResolvedValue([])
    db.creditLedger.groupBy.mockResolvedValue([
      { teamId: 't1', userId: 'u1', _sum: { amountPaisa: null } },
    ])
    expect((await sumTeamMemberSpend(['t1'], NOW)).get('t1:u1')).toBe(0)
  })
})
