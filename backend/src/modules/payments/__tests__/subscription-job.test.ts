jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    subscription: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('../../../shared/infrastructure/team-access', () => ({
  // keep the real, pure helpers (roles, permissions); only the DB-backed lookups are faked
  ...jest.requireActual('../../../shared/infrastructure/team-access'),
  resolveFallbackPlan: jest.fn(),
}))

jest.mock('../../auth', () => ({
  setMyPlan: jest.fn(),
}))

jest.mock('../../notifications/public', () => ({
  enqueueRenewalReminderEmail: jest.fn(),
}))

import { prisma } from '../../../shared/infrastructure/database'
import { setMyPlan } from '../../auth'
import { enqueueRenewalReminderEmail } from '../../notifications/public'
import { resolveFallbackPlan } from '../../../shared/infrastructure/team-access'
import { TEAM_EXPIRY_TX_TIMEOUT_MS, TEAM_SEAT_PRICE_PAISA } from '../constants'
import { runSubscriptionExpiryJob } from '../subscription-job'

const mockFindMany = prisma.subscription.findMany as jest.Mock
const mockUpdate = prisma.subscription.update as jest.Mock

const DAY_MS = 24 * 60 * 60 * 1000

const baseSubscription = (overrides: Record<string, any> = {}) => ({
  id: 'sub-1',
  userId: 'user-1',
  status: 'ACTIVE',
  paymentMethod: 'CARD',
  autoRenew: true,
  currentPeriodStart: new Date(Date.now() - 27 * DAY_MS),
  currentPeriodEnd: new Date(Date.now() + 3 * DAY_MS),
  gracePeriodEnd: null,
  reminderSentAt: null,
  user: { email: 'user@example.com', displayName: 'Hamza' },
  ...overrides,
})

beforeEach(() => jest.clearAllMocks())

describe('runSubscriptionExpiryJob — day-30 expiry', () => {
  it('moves an ACTIVE subscription whose period has lapsed into GRACE', async () => {
    mockFindMany.mockResolvedValue([
      baseSubscription({ currentPeriodEnd: new Date(Date.now() - DAY_MS) }),
    ])

    await runSubscriptionExpiryJob()

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: {
        status: 'GRACE',
        gracePeriodEnd: expect.any(Date),
      },
    })
    expect(enqueueRenewalReminderEmail).not.toHaveBeenCalled()
  })

  it('does not also send a reminder in the same run once a subscription enters grace', async () => {
    mockFindMany.mockResolvedValue([
      baseSubscription({ currentPeriodEnd: new Date(Date.now() - DAY_MS) }),
    ])

    await runSubscriptionExpiryJob()

    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })
})

describe('runSubscriptionExpiryJob — day-27 reminder', () => {
  it('sends a card-on reminder and stamps reminderSentAt', async () => {
    mockFindMany.mockResolvedValue([
      baseSubscription({ paymentMethod: 'CARD', autoRenew: true }),
    ])

    await runSubscriptionExpiryJob()

    expect(enqueueRenewalReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subscriptionId: 'sub-1',
        userName: 'Hamza',
        variant: 'card-on',
      }),
    )
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { reminderSentAt: expect.any(Date) },
    })
  })

  it('sends a card-off reminder when auto-renew is disabled', async () => {
    mockFindMany.mockResolvedValue([
      baseSubscription({ paymentMethod: 'CARD', autoRenew: false }),
    ])

    await runSubscriptionExpiryJob()

    expect(enqueueRenewalReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'card-off' }),
    )
  })

  it('sends a wallet reminder regardless of autoRenew', async () => {
    mockFindMany.mockResolvedValue([
      baseSubscription({ paymentMethod: 'WALLET', autoRenew: false }),
    ])

    await runSubscriptionExpiryJob()

    expect(enqueueRenewalReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'wallet' }),
    )
  })

  it('does not re-send a reminder already sent this billing cycle', async () => {
    mockFindMany.mockResolvedValue([
      baseSubscription({
        reminderSentAt: new Date(Date.now() - DAY_MS), // after currentPeriodStart
      }),
    ])

    await runSubscriptionExpiryJob()

    expect(enqueueRenewalReminderEmail).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('re-sends the reminder on a new cycle even though reminderSentAt is set from a prior cycle', async () => {
    mockFindMany.mockResolvedValue([
      baseSubscription({
        // sent before the start of the CURRENT period -> stale, must re-fire
        reminderSentAt: new Date(Date.now() - 40 * DAY_MS),
        currentPeriodStart: new Date(Date.now() - 27 * DAY_MS),
      }),
    ])

    await runSubscriptionExpiryJob()

    expect(enqueueRenewalReminderEmail).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the subscription is not yet within the reminder window', async () => {
    mockFindMany.mockResolvedValue([
      baseSubscription({
        currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS),
      }),
    ])

    await runSubscriptionExpiryJob()

    expect(enqueueRenewalReminderEmail).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('does nothing for an ACTIVE subscription with no currentPeriodEnd yet (checkout created, webhook not yet confirmed)', async () => {
    mockFindMany.mockResolvedValue([
      baseSubscription({ currentPeriodEnd: null }),
    ])

    await expect(runSubscriptionExpiryJob()).resolves.toBeUndefined()

    expect(enqueueRenewalReminderEmail).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('runSubscriptionExpiryJob — grace period', () => {
  it('downgrades to FREE and marks EXPIRED once the grace period elapses', async () => {
    mockFindMany.mockResolvedValue([
      baseSubscription({
        status: 'GRACE',
        currentPeriodEnd: new Date(Date.now() - 5 * DAY_MS),
        gracePeriodEnd: new Date(Date.now() - DAY_MS),
      }),
    ])

    await runSubscriptionExpiryJob()

    expect(setMyPlan).toHaveBeenCalledWith('user-1', 'FREE')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { status: 'EXPIRED' },
    })
  })

  it('does not downgrade while still inside the grace period', async () => {
    mockFindMany.mockResolvedValue([
      baseSubscription({
        status: 'GRACE',
        currentPeriodEnd: new Date(Date.now() - 5 * DAY_MS),
        gracePeriodEnd: new Date(Date.now() + DAY_MS),
      }),
    ])

    await runSubscriptionExpiryJob()

    expect(setMyPlan).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('runSubscriptionExpiryJob — per-row isolation', () => {
  it('continues processing remaining rows when one row fails', async () => {
    mockFindMany.mockResolvedValue([
      baseSubscription({ id: 'sub-bad', userId: 'user-bad' }),
      baseSubscription({ id: 'sub-good', userId: 'user-good' }),
    ])
    mockUpdate
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({})

    await expect(runSubscriptionExpiryJob()).resolves.toBeUndefined()

    expect(enqueueRenewalReminderEmail).toHaveBeenCalledTimes(2)
    expect(mockUpdate).toHaveBeenCalledTimes(2)
  })

  it('formats a non-Error rejection via String() when logging the per-row failure', async () => {
    mockFindMany.mockResolvedValue([baseSubscription()])
    ;(enqueueRenewalReminderEmail as jest.Mock).mockRejectedValue(
      'raw string failure',
    )

    await expect(runSubscriptionExpiryJob()).resolves.toBeUndefined()
  })
})

describe('runSubscriptionExpiryJob — team subscriptions', () => {
  const teamSubscription = (overrides: Record<string, any> = {}) =>
    baseSubscription({
      userId: null,
      teamId: 'team-1',
      user: null,
      paymentMethod: 'WALLET',
      autoRenew: true,
      team: {
        seatCapacity: 4,
        scheduledSeatCapacity: null,
        billingEmail: null,
        owner: { email: 'owner@fund.com', displayName: 'Olivia' },
      },
      ...overrides,
    })

  it('reminds the owner with the per-seat total and the manual-renewal wording, even if autoRenew is set', async () => {
    mockFindMany.mockResolvedValue([teamSubscription()])

    await runSubscriptionExpiryJob()

    expect(enqueueRenewalReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@fund.com',
        userName: 'Olivia',
        variant: 'wallet',
        amount: `Rs ${((4 * TEAM_SEAT_PRICE_PAISA) / 100).toLocaleString('en-PK')}`,
      }),
    )
  })

  it('sends the reminder to the billing contact instead of the owner when one is set', async () => {
    mockFindMany.mockResolvedValue([
      teamSubscription({
        team: {
          seatCapacity: 4,
          scheduledSeatCapacity: null,
          billingEmail: 'billing@fund.com',
          owner: { email: 'owner@fund.com', displayName: 'Olivia' },
        },
      }),
    ])
    await runSubscriptionExpiryJob()

    expect(enqueueRenewalReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'billing@fund.com',
        // Still addressed to the owner by name.
        userName: 'Olivia',
      }),
    )
  })

  it('quotes the reduced seat count when a reduction is scheduled', async () => {
    mockFindMany.mockResolvedValue([
      teamSubscription({
        team: {
          seatCapacity: 10,
          scheduledSeatCapacity: 6,
          billingEmail: null,
          owner: { email: 'owner@fund.com', displayName: 'Olivia' },
        },
      }),
    ])
    await runSubscriptionExpiryJob()

    expect(enqueueRenewalReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: `Rs ${((6 * TEAM_SEAT_PRICE_PAISA) / 100).toLocaleString('en-PK')}`,
      }),
    )
  })

  it('skips the reminder when the team has no owner to send to', async () => {
    mockFindMany.mockResolvedValue([
      teamSubscription({ team: { seatCapacity: 4, owner: null } }),
    ])
    await runSubscriptionExpiryJob()
    expect(enqueueRenewalReminderEmail).not.toHaveBeenCalled()
  })

  it('cancels the team and restores every member to their fallback plan when grace elapses', async () => {
    mockFindMany.mockResolvedValue([
      teamSubscription({
        status: 'GRACE',
        gracePeriodEnd: new Date(Date.now() - DAY_MS),
      }),
    ])
    const tx = {
      teamMember: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ userId: 'u-pro' }, { userId: 'u-free' }]),
      },
      team: { update: jest.fn() },
      user: { update: jest.fn() },
      subscription: { update: jest.fn() },
      teamAuditLog: { create: jest.fn() },
    }
    ;(prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) =>
      fn(tx),
    )
    ;(resolveFallbackPlan as jest.Mock).mockImplementation(
      async (id: string) => (id === 'u-pro' ? 'PRO' : 'FREE'),
    )

    await runSubscriptionExpiryJob()

    expect(tx.team.update).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: { status: 'CANCELLED' },
    })
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u-pro' },
      data: { plan: 'PRO' },
    })
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u-free' },
      data: { plan: 'FREE' },
    })
    expect(tx.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { status: 'EXPIRED' },
    })
    expect(tx.teamAuditLog.create.mock.calls[0][0].data).toMatchObject({
      teamId: 'team-1',
      action: 'SUBSCRIPTION_EXPIRED',
      actorUserId: null,
    })
    expect(setMyPlan).not.toHaveBeenCalled()
  })
})

describe('runSubscriptionExpiryJob — ending a large team', () => {
  it('runs the member-by-member downgrade with a raised transaction timeout (Prisma defaults to 5 s)', async () => {
    mockFindMany.mockResolvedValue([
      baseSubscription({
        userId: null,
        teamId: 'team-1',
        user: null,
        status: 'GRACE',
        gracePeriodEnd: new Date(Date.now() - DAY_MS),
        team: {
          seatCapacity: 150,
          owner: { email: 'o@fund.com', displayName: 'O' },
        },
      }),
    ])
    const tx = {
      teamMember: { findMany: jest.fn().mockResolvedValue([]) },
      team: { update: jest.fn() },
      user: { update: jest.fn() },
      subscription: { update: jest.fn() },
    }
    ;(prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) =>
      fn(tx),
    )

    await runSubscriptionExpiryJob()

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: TEAM_EXPIRY_TX_TIMEOUT_MS,
    })
    expect(TEAM_EXPIRY_TX_TIMEOUT_MS).toBeGreaterThan(5_000)
  })
})
