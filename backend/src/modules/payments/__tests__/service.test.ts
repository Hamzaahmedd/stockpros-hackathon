jest.mock('../receipt-email', () => ({ sendTeamReceiptEmail: jest.fn() }))
import { PaymentStatus } from '@prisma/client'
import config from '@/config'

jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    paymentTransaction: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    subscription: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('../fulfillment', () => ({
  ...jest.requireActual('../fulfillment'),
  fulfillTeamOrCreditTransaction: jest.fn(),
}))

jest.mock('../../auth', () => ({
  setMyPlan: jest.fn(),
}))

jest.mock('../client', () => ({
  initPaymentSession: jest.fn(),
  buildCheckoutUrl: jest.fn(),
  createSubscriptionCheckout: jest.fn(),
  pauseSafepaySubscription: jest.fn(),
  resumeSafepaySubscription: jest.fn(),
}))

import { prisma } from '../../../shared/infrastructure/database'
import { setMyPlan } from '../../auth'
import {
  buildCheckoutUrl,
  createSubscriptionCheckout,
  initPaymentSession,
  pauseSafepaySubscription,
  resumeSafepaySubscription,
} from '../client'
import { PLAN_PRICES_PAISA, PAYMENT_CURRENCY } from '../constants'
import { fulfillTeamOrCreditTransaction } from '../fulfillment'
import {
  createCheckoutSession,
  getSubscriptionSummary,
  handleSubscriptionRenewalWebhookEvent,
  handleWebhookEvent,
  renewSubscription,
  toggleAutoRenew,
  verifyTracker,
} from '../service'

describe('createCheckoutSession', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.subscription.upsert as jest.Mock).mockResolvedValue({
      id: 'sub-1',
    })
  })

  it('inits a Safepay session, upserts the subscription, persists a PENDING transaction linked to it, and builds the checkout URL', async () => {
    ;(initPaymentSession as jest.Mock).mockResolvedValue({ token: 'trk_new' })
    ;(prisma.paymentTransaction.create as jest.Mock).mockResolvedValue({
      id: 'tx-1',
    })
    ;(buildCheckoutUrl as jest.Mock).mockReturnValue(
      'https://checkout.example/trk_new',
    )

    const result = await createCheckoutSession('user-1', 'WALLET')

    expect(initPaymentSession).toHaveBeenCalledWith(PLAN_PRICES_PAISA.PRO)
    expect(prisma.subscription.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: {
        userId: 'user-1',
        planTier: 'PRO',
        paymentMethod: 'WALLET',
        autoRenew: false,
      },
      update: {
        paymentMethod: 'WALLET',
        autoRenew: false,
      },
    })
    expect(prisma.paymentTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        trackerId: 'trk_new',
        amountPaisa: PLAN_PRICES_PAISA.PRO,
        kind: 'SUBSCRIPTION',
        currency: PAYMENT_CURRENCY,
        status: PaymentStatus.PENDING,
        planTier: 'PRO',
        subscriptionId: 'sub-1',
      },
    })

    const frontendUrl = config.server.frontendUrl
    expect(buildCheckoutUrl).toHaveBeenCalledWith({
      token: 'trk_new',
      orderId: 'tx-1',
      redirectUrl: `${frontendUrl}/plans/result?tracker_id=trk_new&status=success`,
      cancelUrl: `${frontendUrl}/plans/result?tracker_id=trk_new&status=cancelled`,
    })

    expect(result).toEqual({
      checkoutUrl: 'https://checkout.example/trk_new',
      trackerId: 'trk_new',
    })
  })

  it('defaults auto-renew on and uses the Plan-based subscription checkout for CARD', async () => {
    ;(createSubscriptionCheckout as jest.Mock).mockResolvedValue({
      safepaySubscriptionId: 'sub-1',
      subscriptionCheckoutUrl: 'https://checkout.example/subscribe',
    })

    const result = await createCheckoutSession('user-1', 'CARD')

    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          paymentMethod: 'CARD',
          autoRenew: true,
        }),
        update: expect.objectContaining({
          paymentMethod: 'CARD',
          autoRenew: true,
        }),
      }),
    )

    const frontendUrl = config.server.frontendUrl
    expect(createSubscriptionCheckout).toHaveBeenCalledWith({
      reference: 'sub-1',
      redirectUrl: `${frontendUrl}/plans/result?tracker_id=sub-1&status=success`,
      cancelUrl: `${frontendUrl}/plans/result?tracker_id=sub-1&status=cancelled`,
    })
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { safepaySubscriptionId: 'sub-1' },
    })
    expect(initPaymentSession).not.toHaveBeenCalled()
    expect(result).toEqual({
      checkoutUrl: 'https://checkout.example/subscribe',
      trackerId: 'sub-1',
    })
  })
})

describe('handleWebhookEvent — idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.subscription.update as jest.Mock).mockResolvedValue({})
  })

  it('upgrades the plan exactly once for a COMPLETED event on a PENDING transaction', async () => {
    ;(prisma.paymentTransaction.findUnique as jest.Mock).mockResolvedValue({
      trackerId: 'trk_1',
      userId: 'user-1',
      planTier: 'PRO',
      status: PaymentStatus.PENDING,
    })
    ;(prisma.paymentTransaction.updateMany as jest.Mock).mockResolvedValue({
      count: 1,
    })

    await handleWebhookEvent(
      { trackerId: 'trk_1', status: 'COMPLETED', paymentMethod: 'jazzcash' },
      { raw: true },
    )

    expect(prisma.paymentTransaction.updateMany).toHaveBeenCalledTimes(1)
    expect(prisma.paymentTransaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { trackerId: 'trk_1', status: PaymentStatus.PENDING },
      }),
    )
    expect(setMyPlan).toHaveBeenCalledTimes(1)
    expect(setMyPlan).toHaveBeenCalledWith('user-1', 'PRO')
  })

  it('does not reprocess or re-upgrade a transaction that is already COMPLETED', async () => {
    ;(prisma.paymentTransaction.findUnique as jest.Mock).mockResolvedValue({
      trackerId: 'trk_1',
      userId: 'user-1',
      planTier: 'PRO',
      status: PaymentStatus.COMPLETED,
    })
    ;(prisma.paymentTransaction.updateMany as jest.Mock).mockResolvedValue({
      count: 0,
    })

    await handleWebhookEvent(
      { trackerId: 'trk_1', status: 'COMPLETED', paymentMethod: 'jazzcash' },
      { raw: true },
    )

    expect(setMyPlan).not.toHaveBeenCalled()
    expect(prisma.subscription.update).not.toHaveBeenCalled()
  })

  it('grants the plan upgrade only once when two COMPLETED webhooks race for the same transaction', async () => {
    // The conditional `updateMany` is what Postgres actually serializes: the
    // second caller's `WHERE status = PENDING` matches zero rows once the
    // first has flipped it, so `count` is what distinguishes winner from
    // loser here rather than a second findUnique read.
    ;(prisma.paymentTransaction.findUnique as jest.Mock).mockResolvedValue({
      trackerId: 'trk_1',
      userId: 'user-1',
      planTier: 'PRO',
      status: PaymentStatus.PENDING,
    })
    ;(prisma.paymentTransaction.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    const event = {
      trackerId: 'trk_1',
      status: 'COMPLETED' as const,
      paymentMethod: 'jazzcash',
    }

    await Promise.all([
      handleWebhookEvent(event, { raw: true }),
      handleWebhookEvent(event, { raw: true }),
    ])

    expect(setMyPlan).toHaveBeenCalledTimes(1)
  })

  it('does not upgrade the plan for a FAILED event', async () => {
    ;(prisma.paymentTransaction.findUnique as jest.Mock).mockResolvedValue({
      trackerId: 'trk_1',
      userId: 'user-1',
      planTier: 'PRO',
      status: PaymentStatus.PENDING,
    })
    ;(prisma.paymentTransaction.updateMany as jest.Mock).mockResolvedValue({
      count: 1,
    })

    await handleWebhookEvent(
      { trackerId: 'trk_1', status: 'FAILED' },
      { raw: true },
    )

    expect(prisma.paymentTransaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.FAILED }),
      }),
    )
    expect(setMyPlan).not.toHaveBeenCalled()
    expect(prisma.subscription.update).not.toHaveBeenCalled()
  })

  it('ignores webhooks for an unknown trackerId without throwing', async () => {
    ;(prisma.paymentTransaction.findUnique as jest.Mock).mockResolvedValue(null)

    await expect(
      handleWebhookEvent({ trackerId: 'trk_missing', status: 'COMPLETED' }, {}),
    ).resolves.toBeUndefined()

    expect(prisma.paymentTransaction.updateMany).not.toHaveBeenCalled()
    expect(setMyPlan).not.toHaveBeenCalled()
  })
})

describe('handleWebhookEvent — subscription period extension', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.paymentTransaction.findUnique as jest.Mock).mockResolvedValue({
      trackerId: 'trk_1',
      userId: 'user-1',
      planTier: 'PRO',
      status: PaymentStatus.PENDING,
    })
    ;(prisma.paymentTransaction.updateMany as jest.Mock).mockResolvedValue({
      count: 1,
    })
    ;(prisma.subscription.update as jest.Mock).mockResolvedValue({})
  })

  it('starts a fresh 30-day period from now on a first purchase (no existing subscription)', async () => {
    ;(prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null)
    const before = Date.now()

    await handleWebhookEvent(
      { trackerId: 'trk_1', status: 'COMPLETED' },
      { raw: true },
    )

    const call = (prisma.subscription.update as jest.Mock).mock.calls[0][0]
    expect(call.where).toEqual({ userId: 'user-1' })
    expect(call.data.status).toBe('ACTIVE')
    expect(call.data.gracePeriodEnd).toBeNull()
    expect(call.data.reminderSentAt).toBeNull()
    const expectedEnd = before + 30 * 24 * 60 * 60 * 1000
    expect(call.data.currentPeriodEnd.getTime()).toBeGreaterThanOrEqual(
      expectedEnd - 5000,
    )
  })

  it('starts a fresh 30-day period from now when renewing after the period already lapsed', async () => {
    ;(prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
    })
    const before = Date.now()

    await handleWebhookEvent(
      { trackerId: 'trk_1', status: 'COMPLETED' },
      { raw: true },
    )

    const call = (prisma.subscription.update as jest.Mock).mock.calls[0][0]
    const expectedEnd = before + 30 * 24 * 60 * 60 * 1000
    expect(call.data.currentPeriodEnd.getTime()).toBeGreaterThanOrEqual(
      expectedEnd - 5000,
    )
  })

  it('extends cumulatively from the existing currentPeriodEnd on an early renewal (does not cut off remaining paid days)', async () => {
    const existingEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) // 10 days still remaining
    ;(prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      currentPeriodEnd: existingEnd,
    })

    await handleWebhookEvent(
      { trackerId: 'trk_1', status: 'COMPLETED' },
      { raw: true },
    )

    const call = (prisma.subscription.update as jest.Mock).mock.calls[0][0]
    const expectedEnd = existingEnd.getTime() + 30 * 24 * 60 * 60 * 1000
    expect(call.data.currentPeriodEnd.getTime()).toBe(expectedEnd)
  })
})

describe('handleSubscriptionRenewalWebhookEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.subscription.update as jest.Mock).mockResolvedValue({})
  })

  it('extends the period and grants the plan on payment.succeeded', async () => {
    ;(prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      id: 'sub-1',
      userId: 'user-1',
      planTier: 'PRO',
      status: 'ACTIVE',
      currentPeriodEnd: null,
    })

    await handleSubscriptionRenewalWebhookEvent({
      type: 'payment.succeeded',
      reference: 'sub-1',
    })

    expect(prisma.subscription.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ id: 'sub-1' }, { safepaySubscriptionId: 'sub-1' }] },
    })
    expect(setMyPlan).toHaveBeenCalledWith('user-1', 'PRO')
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    )
  })

  it('finds the subscription by safepaySubscriptionId when reference does not match our own id', async () => {
    ;(prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      id: 'sub-1',
      userId: 'user-1',
      planTier: 'PRO',
      status: 'ACTIVE',
      currentPeriodEnd: null,
    })

    await handleSubscriptionRenewalWebhookEvent({
      type: 'payment.succeeded',
      reference: 'safepay-assigned-id',
    })

    expect(setMyPlan).toHaveBeenCalledWith('user-1', 'PRO')
  })

  it('moves an ACTIVE subscription into grace on payment.failed', async () => {
    ;(prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      id: 'sub-1',
      userId: 'user-1',
      planTier: 'PRO',
      status: 'ACTIVE',
    })

    await handleSubscriptionRenewalWebhookEvent({
      type: 'payment.failed',
      reference: 'sub-1',
    })

    expect(setMyPlan).not.toHaveBeenCalled()
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { status: 'GRACE', gracePeriodEnd: expect.any(Date) },
    })
  })

  it('does not re-enter grace for a subscription that is already GRACE/EXPIRED', async () => {
    ;(prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      id: 'sub-1',
      userId: 'user-1',
      status: 'GRACE',
    })

    await handleSubscriptionRenewalWebhookEvent({
      type: 'payment.failed',
      reference: 'sub-1',
    })

    expect(prisma.subscription.update).not.toHaveBeenCalled()
  })

  it('logs and no-ops for an unknown reference', async () => {
    ;(prisma.subscription.findFirst as jest.Mock).mockResolvedValue(null)

    await expect(
      handleSubscriptionRenewalWebhookEvent({
        type: 'payment.succeeded',
        reference: 'unknown',
      }),
    ).resolves.toBeUndefined()

    expect(setMyPlan).not.toHaveBeenCalled()
    expect(prisma.subscription.update).not.toHaveBeenCalled()
  })
})

describe('renewSubscription', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.subscription.upsert as jest.Mock).mockResolvedValue({
      id: 'sub-1',
    })
  })

  it('creates a WALLET checkout session (the manual "pay & extend" path)', async () => {
    ;(initPaymentSession as jest.Mock).mockResolvedValue({ token: 'trk_2' })
    ;(prisma.paymentTransaction.create as jest.Mock).mockResolvedValue({
      id: 'tx-2',
    })
    ;(buildCheckoutUrl as jest.Mock).mockReturnValue('https://checkout.example')

    await renewSubscription('user-1')

    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ paymentMethod: 'WALLET' }),
      }),
    )
  })
})

describe('toggleAutoRenew', () => {
  beforeEach(() => jest.clearAllMocks())

  it('pauses the Safepay subscription when disabling auto-renew', async () => {
    ;(prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      paymentMethod: 'CARD',
      safepaySubscriptionId: 'safepay-sub-1',
    })
    ;(prisma.subscription.update as jest.Mock).mockResolvedValue({
      paymentMethod: 'CARD',
      autoRenew: false,
      status: 'ACTIVE',
      currentPeriodEnd: null,
      gracePeriodEnd: null,
    })

    const result = await toggleAutoRenew('user-1', false)

    expect(pauseSafepaySubscription).toHaveBeenCalledWith('safepay-sub-1')
    expect(resumeSafepaySubscription).not.toHaveBeenCalled()
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { autoRenew: false },
    })
    expect(result.autoRenew).toBe(false)
  })

  it('resumes the Safepay subscription when enabling auto-renew', async () => {
    ;(prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      paymentMethod: 'CARD',
      safepaySubscriptionId: 'safepay-sub-1',
    })
    ;(prisma.subscription.update as jest.Mock).mockResolvedValue({
      paymentMethod: 'CARD',
      autoRenew: true,
      status: 'ACTIVE',
      currentPeriodEnd: null,
      gracePeriodEnd: null,
    })

    await toggleAutoRenew('user-1', true)

    expect(resumeSafepaySubscription).toHaveBeenCalledWith('safepay-sub-1')
    expect(pauseSafepaySubscription).not.toHaveBeenCalled()
  })

  it('skips the Safepay pause/resume call when no subscription has been authorized yet', async () => {
    ;(prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      paymentMethod: 'CARD',
      safepaySubscriptionId: null,
    })
    ;(prisma.subscription.update as jest.Mock).mockResolvedValue({
      paymentMethod: 'CARD',
      autoRenew: false,
      status: 'ACTIVE',
      currentPeriodEnd: null,
      gracePeriodEnd: null,
    })

    await toggleAutoRenew('user-1', false)

    expect(pauseSafepaySubscription).not.toHaveBeenCalled()
    expect(resumeSafepaySubscription).not.toHaveBeenCalled()
  })

  it('rejects toggling auto-renew for a WALLET subscription', async () => {
    ;(prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      paymentMethod: 'WALLET',
    })

    await expect(toggleAutoRenew('user-1', true)).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(prisma.subscription.update).not.toHaveBeenCalled()
  })

  it('throws 404 when the user has no subscription at all', async () => {
    ;(prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null)

    await expect(toggleAutoRenew('user-1', true)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('getSubscriptionSummary', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns the subscription summary', async () => {
    ;(prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      paymentMethod: 'CARD',
      autoRenew: true,
      status: 'ACTIVE',
      currentPeriodEnd: new Date('2026-01-01'),
      gracePeriodEnd: null,
    })

    const result = await getSubscriptionSummary('user-1')

    expect(result).toEqual({
      paymentMethod: 'CARD',
      autoRenew: true,
      status: 'ACTIVE',
      currentPeriodEnd: new Date('2026-01-01'),
      gracePeriodEnd: null,
    })
  })

  it('throws 404 when there is no subscription', async () => {
    ;(prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null)

    await expect(getSubscriptionSummary('user-1')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('verifyTracker — ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the transaction status when it belongs to the caller', async () => {
    ;(prisma.paymentTransaction.findUnique as jest.Mock).mockResolvedValue({
      trackerId: 'trk_1',
      userId: 'user-1',
      status: PaymentStatus.COMPLETED,
      planTier: 'PRO',
    })

    const result = await verifyTracker('user-1', 'trk_1')

    expect(result).toEqual({
      trackerId: 'trk_1',
      status: PaymentStatus.COMPLETED,
      plan: 'PRO',
    })
  })

  it('rejects with 403 when the transaction belongs to a different user', async () => {
    ;(prisma.paymentTransaction.findUnique as jest.Mock).mockResolvedValue({
      trackerId: 'trk_1',
      userId: 'someone-else',
      status: PaymentStatus.COMPLETED,
      planTier: 'PRO',
    })

    await expect(verifyTracker('user-1', 'trk_1')).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('rejects with 404 when the tracker does not exist', async () => {
    ;(prisma.paymentTransaction.findUnique as jest.Mock).mockResolvedValue(null)

    await expect(verifyTracker('user-1', 'trk_missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('handleWebhookEvent — team & credit transactions', () => {
  const event = { trackerId: 'trk-1', status: 'COMPLETED' } as const

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    ['TOPUP', 'PRO'],
    ['SEAT_ADDITION', 'TEAM'],
    ['SUBSCRIPTION', 'TEAM'],
  ])(
    'hands %s/%s transactions to the atomic fulfilment path, not the legacy PRO path',
    async (kind, planTier) => {
      ;(prisma.paymentTransaction.findUnique as jest.Mock).mockResolvedValue({
        trackerId: 'trk-1',
        userId: 'user-1',
        kind,
        planTier,
        status: 'PENDING',
      })
      ;(fulfillTeamOrCreditTransaction as jest.Mock).mockResolvedValue(true)

      await handleWebhookEvent(event, { raw: true })

      expect(fulfillTeamOrCreditTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ kind, planTier }),
        event,
        PaymentStatus.COMPLETED,
        { raw: true },
      )
      expect(prisma.paymentTransaction.updateMany).not.toHaveBeenCalled()
      expect(setMyPlan).not.toHaveBeenCalled()
    },
  )

  it('is a no-op for a duplicate webhook (fulfilment reports nothing applied)', async () => {
    ;(prisma.paymentTransaction.findUnique as jest.Mock).mockResolvedValue({
      trackerId: 'trk-1',
      kind: 'TOPUP',
      planTier: 'PRO',
      status: 'COMPLETED',
    })
    ;(fulfillTeamOrCreditTransaction as jest.Mock).mockResolvedValue(false)

    await expect(handleWebhookEvent(event, {})).resolves.toBeUndefined()
    expect(setMyPlan).not.toHaveBeenCalled()
  })
})

describe('handleSubscriptionRenewalWebhookEvent — team rows', () => {
  it('ignores a webhook that resolves to a team subscription (no userId)', async () => {
    ;(prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      id: 'sub-team',
      userId: null,
      teamId: 'team-1',
    })

    await handleSubscriptionRenewalWebhookEvent({
      type: 'payment.succeeded',
      reference: 'sub-team',
    })

    expect(setMyPlan).not.toHaveBeenCalled()
    expect(prisma.subscription.update).not.toHaveBeenCalled()
  })
})
