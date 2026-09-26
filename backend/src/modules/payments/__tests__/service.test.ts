import { PaymentStatus } from '@prisma/client'

jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    paymentTransaction: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('../../auth', () => ({
  setMyPlan: jest.fn(),
}))

import { prisma } from '../../../shared/infrastructure/database'
import { setMyPlan } from '../../auth'
import { handleWebhookEvent, verifyTracker } from '../service'

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
    ;(prisma.paymentTransaction.update as jest.Mock).mockResolvedValue({})

    await handleWebhookEvent(
      { trackerId: 'trk_1', status: 'COMPLETED', paymentMethod: 'jazzcash' },
      { raw: true },
    )

    expect(prisma.paymentTransaction.update).toHaveBeenCalledTimes(1)
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

    await handleWebhookEvent(
      { trackerId: 'trk_1', status: 'COMPLETED', paymentMethod: 'jazzcash' },
      { raw: true },
    )

    expect(prisma.paymentTransaction.update).not.toHaveBeenCalled()
    expect(setMyPlan).not.toHaveBeenCalled()
  })

  it('does not upgrade the plan for a FAILED event', async () => {
    ;(prisma.paymentTransaction.findUnique as jest.Mock).mockResolvedValue({
      trackerId: 'trk_1',
      userId: 'user-1',
      planTier: 'PRO',
      status: PaymentStatus.PENDING,
    })
    ;(prisma.paymentTransaction.update as jest.Mock).mockResolvedValue({})

    await handleWebhookEvent(
      { trackerId: 'trk_1', status: 'FAILED' },
      { raw: true },
    )

    expect(prisma.paymentTransaction.update).toHaveBeenCalledWith(
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

    expect(prisma.paymentTransaction.update).not.toHaveBeenCalled()
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
