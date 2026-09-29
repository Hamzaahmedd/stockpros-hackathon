jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    subscription: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
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
