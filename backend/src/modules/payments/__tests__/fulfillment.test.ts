jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: { $transaction: jest.fn() },
}))

import { PaymentKind, PaymentStatus, PlanTier } from '@prisma/client'
import { prisma } from '../../../shared/infrastructure/database'
import { SUBSCRIPTION_PERIOD_MS } from '../constants'
import {
  computeNextPeriodEnd,
  fulfillTeamOrCreditTransaction,
  isTeamOrCreditTransaction,
} from '../fulfillment'

const txn = (overrides: Record<string, any> = {}) =>
  ({
    id: 'txn-1',
    userId: 'user-1',
    teamId: null,
    trackerId: 'trk-1',
    amountPaisa: 100_000,
    seatCount: 1,
    kind: PaymentKind.SUBSCRIPTION,
    planTier: PlanTier.TEAM,
    metadata: null,
    ...overrides,
  }) as any

const event = {
  trackerId: 'trk-1',
  status: 'COMPLETED',
  paymentMethod: 'card',
} as any

const makeTx = () => ({
  paymentTransaction: {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    update: jest.fn(),
  },
  team: {
    create: jest
      .fn()
      .mockResolvedValue({ id: 'team-9', subscription: { id: 'sub-9' } }),
    update: jest.fn(),
  },
  user: { update: jest.fn(), updateMany: jest.fn() },
  creditLedger: { create: jest.fn() },
  subscription: { findUnique: jest.fn(), update: jest.fn() },
})

let tx: ReturnType<typeof makeTx>

const run = (
  transaction: any,
  status: PaymentStatus = PaymentStatus.COMPLETED,
) => fulfillTeamOrCreditTransaction(transaction, event, status, { raw: true })

beforeEach(() => {
  jest.clearAllMocks()
  tx = makeTx()
  ;(prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) =>
    fn(tx),
  )
})

describe('computeNextPeriodEnd', () => {
  const now = new Date('2026-09-30T00:00:00Z')

  it('starts a fresh cycle from now for a first purchase or lapsed period', () => {
    expect(computeNextPeriodEnd(null, now).getTime()).toBe(
      now.getTime() + SUBSCRIPTION_PERIOD_MS,
    )
    expect(
      computeNextPeriodEnd(new Date('2026-09-01T00:00:00Z'), now).getTime(),
    ).toBe(now.getTime() + SUBSCRIPTION_PERIOD_MS)
  })

  it('stacks onto a still-live period so early renewals lose no days', () => {
    const live = new Date('2026-10-05T00:00:00Z')
    expect(computeNextPeriodEnd(live, now).getTime()).toBe(
      live.getTime() + SUBSCRIPTION_PERIOD_MS,
    )
  })
})

describe('isTeamOrCreditTransaction', () => {
  it('routes seats, top-ups and TEAM-tier transactions, but not plain PRO', () => {
    expect(
      isTeamOrCreditTransaction(
        txn({ kind: PaymentKind.TOPUP, planTier: PlanTier.PRO }),
      ),
    ).toBe(true)
    expect(
      isTeamOrCreditTransaction(txn({ kind: PaymentKind.SEAT_ADDITION })),
    ).toBe(true)
    expect(
      isTeamOrCreditTransaction(
        txn({ kind: PaymentKind.SUBSCRIPTION, planTier: PlanTier.TEAM }),
      ),
    ).toBe(true)
    expect(
      isTeamOrCreditTransaction(
        txn({ kind: PaymentKind.SUBSCRIPTION, planTier: PlanTier.PRO }),
      ),
    ).toBe(false)
  })
})

describe('idempotency guard', () => {
  it('does nothing when the transaction was already moved off PENDING (duplicate webhook)', async () => {
    tx.paymentTransaction.updateMany.mockResolvedValue({ count: 0 })

    const applied = await run(txn({ kind: PaymentKind.TOPUP }))

    expect(applied).toBe(false)
    expect(tx.user.update).not.toHaveBeenCalled()
    expect(tx.team.update).not.toHaveBeenCalled()
    expect(tx.creditLedger.create).not.toHaveBeenCalled()
  })

  it('only transitions rows that are still PENDING', async () => {
    await run(txn({ kind: PaymentKind.TOPUP }))
    expect(tx.paymentTransaction.updateMany).toHaveBeenCalledWith({
      where: { trackerId: 'trk-1', status: PaymentStatus.PENDING },
      data: {
        status: PaymentStatus.COMPLETED,
        paymentMethod: 'card',
        rawWebhookPayload: { raw: true },
      },
    })
  })

  it('records a non-completed status without any side effect', async () => {
    const applied = await run(
      txn({ kind: PaymentKind.TOPUP }),
      PaymentStatus.FAILED,
    )
    expect(applied).toBe(true)
    expect(tx.user.update).not.toHaveBeenCalled()
    expect(tx.creditLedger.create).not.toHaveBeenCalled()
  })
})

describe('TOPUP fulfilment', () => {
  it('credits the buyer and logs a PURCHASE ledger row for an individual user', async () => {
    await run(txn({ kind: PaymentKind.TOPUP, planTier: PlanTier.PRO }))

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { creditBalanceInPaisa: { increment: 100_000 } },
    })
    expect(tx.creditLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        teamId: null,
        amountPaisa: 100_000,
        type: 'PURCHASE',
        trackerId: 'trk-1',
      }),
    })
  })

  it('credits the team pool when the purchase is tied to a team', async () => {
    await run(txn({ kind: PaymentKind.TOPUP, teamId: 'team-1' }))

    expect(tx.team.update).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: { creditBalanceInPaisa: { increment: 100_000 } },
    })
    expect(tx.user.update).not.toHaveBeenCalled()
  })
})

describe('SEAT_ADDITION fulfilment', () => {
  it('increments seat capacity by the purchased seat count', async () => {
    await run(
      txn({ kind: PaymentKind.SEAT_ADDITION, teamId: 'team-1', seatCount: 3 }),
    )
    expect(tx.team.update).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: { seatCapacity: { increment: 3 } },
    })
  })

  it('refuses a seat addition that has no team', async () => {
    await expect(run(txn({ kind: PaymentKind.SEAT_ADDITION }))).rejects.toThrow(
      'Seat addition is missing a team',
    )
  })
})

describe('team creation fulfilment', () => {
  it('creates the team, OWNER member and a manual-renewal subscription, then upgrades the owner', async () => {
    await run(txn({ seatCount: 5, metadata: { teamName: 'Alpha Fund' } }))

    const { data } = tx.team.create.mock.calls[0][0]
    expect(data).toMatchObject({
      name: 'Alpha Fund',
      ownerId: 'user-1',
      seatCapacity: 5,
      members: { create: { userId: 'user-1', role: 'OWNER' } },
    })
    expect(data.subscription.create).toMatchObject({
      planTier: 'TEAM',
      paymentMethod: 'WALLET',
      autoRenew: false,
    })
    expect(tx.paymentTransaction.update).toHaveBeenCalledWith({
      where: { id: 'txn-1' },
      data: { teamId: 'team-9', subscriptionId: 'sub-9' },
    })
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { plan: 'TEAM' },
    })
  })

  it.each([null, {}, { teamName: '  ' }, { teamName: 7 }, ['x']])(
    'rejects a checkout whose metadata has no usable team name (%j)',
    async (metadata) => {
      await expect(run(txn({ metadata }))).rejects.toThrow(
        'missing a team name',
      )
      expect(tx.team.create).not.toHaveBeenCalled()
    },
  )
})

describe('team renewal fulfilment', () => {
  it('extends the period, reactivates the team and puts members back on TEAM', async () => {
    const liveEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    tx.subscription.findUnique.mockResolvedValue({ currentPeriodEnd: liveEnd })

    await run(txn({ teamId: 'team-1' }))

    const { data } = tx.subscription.update.mock.calls[0][0]
    expect(data).toMatchObject({
      status: 'ACTIVE',
      gracePeriodEnd: null,
      reminderSentAt: null,
    })
    expect(data.currentPeriodEnd.getTime()).toBe(
      liveEnd.getTime() + SUBSCRIPTION_PERIOD_MS,
    )
    expect(tx.team.update).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: { status: 'ACTIVE' },
    })
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { teamMembers: { some: { teamId: 'team-1' } } },
      data: { plan: 'TEAM' },
    })
  })

  it('skips gracefully when the team has no subscription row', async () => {
    tx.subscription.findUnique.mockResolvedValue(null)
    await run(txn({ teamId: 'team-1' }))
    expect(tx.subscription.update).not.toHaveBeenCalled()
  })
})
