jest.mock('../service', () => ({
  createCheckoutSession: jest.fn(),
  handleWebhookEvent: jest.fn(),
  verifyTracker: jest.fn(),
}))

jest.mock('../signature', () => ({
  SAFEPAY_SIGNATURE_HEADER: 'x-sfpy-signature',
  verifySafepaySignature: jest.fn(),
}))

import {
  createCheckoutSession,
  handleWebhookEvent,
  verifyTracker,
} from '../service'
import { verifySafepaySignature } from '../signature'
import * as controller from '../controller'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}
const mockReq = (overrides: Record<string, any> = {}) => ({
  user: { userId: 'user-1' },
  body: {},
  headers: {},
  ...overrides,
})
const next = jest.fn()

beforeEach(() => jest.clearAllMocks())

describe('createCheckout', () => {
  it('creates a checkout session for the PRO plan', async () => {
    ;(createCheckoutSession as jest.Mock).mockResolvedValue({
      checkoutUrl: 'https://pay',
    })
    const req = mockReq({ body: { plan: 'PRO' } })
    const res = mockRes()
    await controller.createCheckout(req as any, res, next)
    expect(createCheckoutSession).toHaveBeenCalledWith('user-1')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ checkoutUrl: 'https://pay' }),
    )
  })

  it('rejects a non-PRO plan', async () => {
    const req = mockReq({ body: { plan: 'FREE' } })
    const res = mockRes()
    await controller.createCheckout(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })
})

describe('safepayWebhook', () => {
  it('rejects a webhook with an invalid signature', async () => {
    ;(verifySafepaySignature as jest.Mock).mockReturnValue(false)
    const req = mockReq({
      body: { data: {} },
      headers: { 'x-sfpy-signature': 'bad' },
    })
    const res = mockRes()
    await controller.safepayWebhook(req as any, res, next)
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 }),
    )
    expect(handleWebhookEvent).not.toHaveBeenCalled()
  })

  it('acknowledges (200) but skips processing a webhook body with no data/notification at all', async () => {
    ;(verifySafepaySignature as jest.Mock).mockReturnValue(true)
    const req = mockReq({ body: {} })
    const res = mockRes()
    await controller.safepayWebhook(req as any, res, next)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(handleWebhookEvent).not.toHaveBeenCalled()
  })

  it('acknowledges (200) but skips processing a payload with no tracker id', async () => {
    ;(verifySafepaySignature as jest.Mock).mockReturnValue(true)
    const req = mockReq({ body: { data: { notification: {} } } })
    const res = mockRes()
    await controller.safepayWebhook(req as any, res, next)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(handleWebhookEvent).not.toHaveBeenCalled()
  })

  it('processes a valid webhook event and acknowledges it', async () => {
    ;(verifySafepaySignature as jest.Mock).mockReturnValue(true)
    ;(handleWebhookEvent as jest.Mock).mockResolvedValue(undefined)
    const req = mockReq({
      body: {
        data: {
          token: 'trk_123',
          notification: { state: 'PAID', intent: 'jazzcash' },
        },
      },
    })
    const res = mockRes()
    await controller.safepayWebhook(req as any, res, next)
    expect(handleWebhookEvent).toHaveBeenCalledWith(
      { trackerId: 'trk_123', status: 'COMPLETED', paymentMethod: 'jazzcash' },
      req.body,
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true })
  })

  it('treats an unrecognized notification state as still PENDING', async () => {
    ;(verifySafepaySignature as jest.Mock).mockReturnValue(true)
    ;(handleWebhookEvent as jest.Mock).mockResolvedValue(undefined)
    const req = mockReq({
      body: {
        data: { token: 'trk_123', notification: { state: 'PROCESSING' } },
      },
    })
    const res = mockRes()
    await controller.safepayWebhook(req as any, res, next)
    expect(handleWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING' }),
      req.body,
    )
  })

  it('falls back to notification.tracker when data.token is absent', async () => {
    ;(verifySafepaySignature as jest.Mock).mockReturnValue(true)
    ;(handleWebhookEvent as jest.Mock).mockResolvedValue(undefined)
    const req = mockReq({
      body: {
        data: { notification: { tracker: 'trk_fallback', state: 'PAID' } },
      },
    })
    const res = mockRes()
    await controller.safepayWebhook(req as any, res, next)
    expect(handleWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ trackerId: 'trk_fallback' }),
      req.body,
    )
  })

  it('forwards a downstream processing failure to next()', async () => {
    ;(verifySafepaySignature as jest.Mock).mockReturnValue(true)
    ;(handleWebhookEvent as jest.Mock).mockRejectedValue(new Error('db down'))
    const req = mockReq({
      body: { data: { token: 'trk_123', notification: { state: 'PAID' } } },
    })
    const res = mockRes()
    await controller.safepayWebhook(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('verifyTrackerHandler', () => {
  it("returns the caller's transaction status", async () => {
    ;(verifyTracker as jest.Mock).mockResolvedValue({ status: 'COMPLETED' })
    const req = mockReq({ body: { trackerId: 'trk_123' } })
    const res = mockRes()
    await controller.verifyTrackerHandler(req as any, res, next)
    expect(verifyTracker).toHaveBeenCalledWith('user-1', 'trk_123')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'COMPLETED' }),
    )
  })

  it('rejects a missing trackerId', async () => {
    const req = mockReq({ body: {} })
    const res = mockRes()
    await controller.verifyTrackerHandler(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
