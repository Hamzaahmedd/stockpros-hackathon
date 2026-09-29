import { PaymentStatus } from '@prisma/client'
import config from '@/config'

jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    paymentTransaction: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  },
}))

jest.mock('../../auth', () => ({
  setMyPlan: jest.fn(),
}))

jest.mock('../client', () => ({
  initPaymentSession: jest.fn(),
  buildCheckoutUrl: jest.fn(),
}))

import { prisma } from '../../../shared/infrastructure/database'
import { setMyPlan } from '../../auth'
import { buildCheckoutUrl, initPaymentSession } from '../client'
import { PLAN_PRICES_PAISA, PAYMENT_CURRENCY } from '../constants'
import {
  createCheckoutSession,
  handleWebhookEvent,
  verifyTracker,
} from '../service'

describe('createCheckoutSession', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('inits a Safepay session, persists a PENDING transaction, and builds the checkout URL from it', async () => {
    ;(initPaymentSession as jest.Mock).mockResolvedValue({ token: 'trk_new' })
    ;(prisma.paymentTransaction.create as jest.Mock).mockResolvedValue({
      id: 'tx-1',
    })
    ;(buildCheckoutUrl as jest.Mock).mockReturnValue(
      'https://checkout.example/trk_new',
    )

    const result = await createCheckoutSession('user-1')

    expect(initPaymentSession).toHaveBeenCalledWith(PLAN_PRICES_PAISA.PRO)
    expect(prisma.paymentTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        trackerId: 'trk_new',
        amount: PLAN_PRICES_PAISA.PRO,
        currency: PAYMENT_CURRENCY,
        status: PaymentStatus.PENDING,
        planTier: 'PRO',
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
})

describe('handleWebhookEvent — idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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
