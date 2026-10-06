jest.mock('../service', () => ({
  createCheckoutSession: jest.fn(),
  getSubscriptionSummary: jest.fn(),
  handleSubscriptionRenewalWebhookEvent: jest.fn(),
  handleWebhookEvent: jest.fn(),
  renewSubscription: jest.fn(),
  toggleAutoRenew: jest.fn(),
  verifyTracker: jest.fn(),
}))

jest.mock('../ledger', () => ({ getCreditLedger: jest.fn() }))

jest.mock('../usage', () => ({ getMyUsage: jest.fn() }))

jest.mock('../usage-history', () => ({ getUsageHistory: jest.fn() }))

jest.mock('../receipts', () => ({
  getTeamReceipt: jest.fn(),
  listTeamTransactions: jest.fn(),
}))

jest.mock('../team-billing', () => ({
  createTeamCheckout: jest.fn(),
  createTeamRenewalCheckout: jest.fn(),
  createTopupCheckout: jest.fn(),
  getTeamSubscriptionSummary: jest.fn(),
  toggleTeamAutoRenew: jest.fn(),
}))

jest.mock('../signature', () => ({
  SAFEPAY_SIGNATURE_HEADER: 'x-sfpy-signature',
  verifySafepaySignature: jest.fn(),
}))

import {
  createCheckoutSession,
  getSubscriptionSummary,
  handleSubscriptionRenewalWebhookEvent,
  handleWebhookEvent,
  renewSubscription,
  toggleAutoRenew,
  verifyTracker,
} from '../service'
import { getCreditLedger } from '../ledger'
import { getMyUsage } from '../usage'
import { getUsageHistory } from '../usage-history'
import { getTeamReceipt, listTeamTransactions } from '../receipts'
import { verifySafepaySignature } from '../signature'
import {
  createTeamCheckout,
  createTeamRenewalCheckout,
  createTopupCheckout,
  getTeamSubscriptionSummary,
  toggleTeamAutoRenew,
} from '../team-billing'
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
  query: {},
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
    const req = mockReq({ body: { plan: 'PRO', paymentMethod: 'WALLET' } })
    const res = mockRes()
    await controller.createCheckout(req as any, res, next)
    expect(createCheckoutSession).toHaveBeenCalledWith('user-1', 'WALLET')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ checkoutUrl: 'https://pay' }),
    )
  })

  it('rejects a non-PRO plan', async () => {
    const req = mockReq({ body: { plan: 'FREE', paymentMethod: 'WALLET' } })
    const res = mockRes()
    await controller.createCheckout(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  it('rejects a missing/invalid payment method', async () => {
    const req = mockReq({ body: { plan: 'PRO', paymentMethod: 'CASH' } })
    const res = mockRes()
    await controller.createCheckout(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })
})

describe('getSubscription', () => {
  it("returns the caller's subscription summary", async () => {
    ;(getSubscriptionSummary as jest.Mock).mockResolvedValue({
      status: 'ACTIVE',
    })
    const req = mockReq()
    const res = mockRes()
    await controller.getSubscription(req as any, res, next)
    expect(getSubscriptionSummary).toHaveBeenCalledWith('user-1')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' }),
    )
  })

  it('forwards a downstream error to next()', async () => {
    ;(getSubscriptionSummary as jest.Mock).mockRejectedValue(new Error('boom'))
    const req = mockReq()
    const res = mockRes()
    await controller.getSubscription(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('renewSubscriptionHandler', () => {
  it('creates a renewal checkout session', async () => {
    ;(renewSubscription as jest.Mock).mockResolvedValue({
      checkoutUrl: 'https://pay',
    })
    const req = mockReq()
    const res = mockRes()
    await controller.renewSubscriptionHandler(req as any, res, next)
    expect(renewSubscription).toHaveBeenCalledWith('user-1')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ checkoutUrl: 'https://pay' }),
    )
  })

  it('forwards a downstream error to next()', async () => {
    ;(renewSubscription as jest.Mock).mockRejectedValue(new Error('boom'))
    const req = mockReq()
    const res = mockRes()
    await controller.renewSubscriptionHandler(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('toggleAutoRenewHandler', () => {
  it('enables auto-renew for the caller', async () => {
    ;(toggleAutoRenew as jest.Mock).mockResolvedValue({ autoRenew: true })
    const req = mockReq({ body: { enabled: true } })
    const res = mockRes()
    await controller.toggleAutoRenewHandler(req as any, res, next)
    expect(toggleAutoRenew).toHaveBeenCalledWith('user-1', true)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ autoRenew: true }),
    )
  })

  it('disables auto-renew for the caller', async () => {
    ;(toggleAutoRenew as jest.Mock).mockResolvedValue({ autoRenew: false })
    const req = mockReq({ body: { enabled: false } })
    const res = mockRes()
    await controller.toggleAutoRenewHandler(req as any, res, next)
    expect(toggleAutoRenew).toHaveBeenCalledWith('user-1', false)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ autoRenew: false }),
    )
  })

  it('rejects a missing/invalid enabled field', async () => {
    const req = mockReq({ body: {} })
    const res = mockRes()
    await controller.toggleAutoRenewHandler(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(toggleAutoRenew).not.toHaveBeenCalled()
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

  it('routes a payment.succeeded subscription event to handleSubscriptionRenewalWebhookEvent instead of the one-time handler', async () => {
    ;(verifySafepaySignature as jest.Mock).mockReturnValue(true)
    ;(handleSubscriptionRenewalWebhookEvent as jest.Mock).mockResolvedValue(
      undefined,
    )
    const req = mockReq({
      body: { data: { type: 'payment.succeeded', reference: 'sub-1' } },
    })
    const res = mockRes()
    await controller.safepayWebhook(req as any, res, next)
    expect(handleSubscriptionRenewalWebhookEvent).toHaveBeenCalledWith({
      type: 'payment.succeeded',
      reference: 'sub-1',
    })
    expect(handleWebhookEvent).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true })
  })

  it('routes a payment.failed subscription event the same way', async () => {
    ;(verifySafepaySignature as jest.Mock).mockReturnValue(true)
    ;(handleSubscriptionRenewalWebhookEvent as jest.Mock).mockResolvedValue(
      undefined,
    )
    const req = mockReq({
      body: { data: { type: 'payment.failed', reference: 'sub-1' } },
    })
    const res = mockRes()
    await controller.safepayWebhook(req as any, res, next)
    expect(handleSubscriptionRenewalWebhookEvent).toHaveBeenCalledWith({
      type: 'payment.failed',
      reference: 'sub-1',
    })
  })

  it('falls back to the one-time handler when the payload has no recognized subscription type', async () => {
    ;(verifySafepaySignature as jest.Mock).mockReturnValue(true)
    ;(handleWebhookEvent as jest.Mock).mockResolvedValue(undefined)
    const req = mockReq({
      body: { data: { type: 'something.else', token: 'trk_123' } },
    })
    const res = mockRes()
    await controller.safepayWebhook(req as any, res, next)
    expect(handleSubscriptionRenewalWebhookEvent).not.toHaveBeenCalled()
    expect(handleWebhookEvent).toHaveBeenCalled()
  })

  it('falls back to the one-time handler when the subscription type is recognized but reference is missing', async () => {
    ;(verifySafepaySignature as jest.Mock).mockReturnValue(true)
    ;(handleWebhookEvent as jest.Mock).mockResolvedValue(undefined)
    const req = mockReq({
      body: {
        data: {
          type: 'payment.succeeded',
          token: 'trk_123',
          notification: { state: 'PAID' },
        },
      },
    })
    const res = mockRes()
    await controller.safepayWebhook(req as any, res, next)
    expect(handleSubscriptionRenewalWebhookEvent).not.toHaveBeenCalled()
    expect(handleWebhookEvent).toHaveBeenCalled()
  })

  it('forwards a downstream subscription-webhook processing failure to next()', async () => {
    ;(verifySafepaySignature as jest.Mock).mockReturnValue(true)
    ;(handleSubscriptionRenewalWebhookEvent as jest.Mock).mockRejectedValue(
      new Error('db down'),
    )
    const req = mockReq({
      body: { data: { type: 'payment.succeeded', reference: 'sub-1' } },
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

describe('createCheckout — TEAM and TOPUP', () => {
  it('routes a TEAM plan to the team checkout with validated seat count + name', async () => {
    ;(createTeamCheckout as jest.Mock).mockResolvedValue({
      checkoutUrl: 'https://t',
    })
    const req = mockReq({
      body: { plan: 'TEAM', seatCount: 5, teamName: 'Alpha' },
    })
    await controller.createCheckout(req as any, mockRes(), next)
    expect(createTeamCheckout).toHaveBeenCalledWith('user-1', {
      plan: 'TEAM',
      seatCount: 5,
      teamName: 'Alpha',
    })
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  it.each([1, 151, 2.5, '5'])('rejects seatCount %j', async (seatCount) => {
    const req = mockReq({
      body: { plan: 'TEAM', seatCount, teamName: 'Alpha' },
    })
    await controller.createCheckout(req as any, mockRes(), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(createTeamCheckout).not.toHaveBeenCalled()
  })

  it('routes a TOPUP plan with a known pack, and rejects an unknown pack', async () => {
    ;(createTopupCheckout as jest.Mock).mockResolvedValue({
      checkoutUrl: 'https://t',
    })
    await controller.createCheckout(
      mockReq({ body: { plan: 'TOPUP', packId: 'PACK_500' } }) as any,
      mockRes(),
      next,
    )
    expect(createTopupCheckout).toHaveBeenCalledWith('user-1', 'PACK_500')

    jest.clearAllMocks()
    await controller.createCheckout(
      mockReq({ body: { plan: 'TOPUP', packId: 'PACK_1' } }) as any,
      mockRes(),
      next,
    )
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(createTopupCheckout).not.toHaveBeenCalled()
  })

  it('never reads a price from the client body', async () => {
    ;(createTopupCheckout as jest.Mock).mockResolvedValue({})
    await controller.createCheckout(
      mockReq({
        body: { plan: 'TOPUP', packId: 'PACK_500', amountPaisa: 1 },
      }) as any,
      mockRes(),
      next,
    )
    expect(createTopupCheckout).toHaveBeenCalledWith('user-1', 'PACK_500')
  })
})

describe('subscription handlers — TEAM scope', () => {
  it('getSubscription?scope=TEAM returns the team summary', async () => {
    ;(getTeamSubscriptionSummary as jest.Mock).mockResolvedValue({
      status: 'ACTIVE',
    })
    await controller.getSubscription(
      mockReq({ query: { scope: 'TEAM' } }) as any,
      mockRes(),
      next,
    )
    expect(getTeamSubscriptionSummary).toHaveBeenCalledWith('user-1')
    expect(getSubscriptionSummary).not.toHaveBeenCalled()
  })

  it('renew?scope=TEAM creates a team renewal checkout', async () => {
    ;(createTeamRenewalCheckout as jest.Mock).mockResolvedValue({
      checkoutUrl: 'https://t',
    })
    await controller.renewSubscriptionHandler(
      mockReq({ query: { scope: 'TEAM' } }) as any,
      mockRes(),
      next,
    )
    expect(createTeamRenewalCheckout).toHaveBeenCalledWith('user-1')
    expect(renewSubscription).not.toHaveBeenCalled()
  })

  it('auto-renew with scope TEAM toggles the team flag; default scope stays personal', async () => {
    ;(toggleTeamAutoRenew as jest.Mock).mockResolvedValue({ autoRenew: true })
    await controller.toggleAutoRenewHandler(
      mockReq({ body: { enabled: true, scope: 'TEAM' } }) as any,
      mockRes(),
      next,
    )
    expect(toggleTeamAutoRenew).toHaveBeenCalledWith('user-1', true)
    expect(toggleAutoRenew).not.toHaveBeenCalled()

    ;(toggleAutoRenew as jest.Mock).mockResolvedValue({ autoRenew: false })
    await controller.toggleAutoRenewHandler(
      mockReq({ body: { enabled: false } }) as any,
      mockRes(),
      next,
    )
    expect(toggleAutoRenew).toHaveBeenCalledWith('user-1', false)
  })

  it('rejects an unknown scope', async () => {
    await controller.getSubscription(
      mockReq({ query: { scope: 'ORG' } }) as any,
      mockRes(),
      next,
    )
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getCreditLedgerHandler', () => {
  it('validates the query, applies defaults, and returns the page', async () => {
    ;(getCreditLedger as jest.Mock).mockResolvedValue({ entries: [] })
    const res = mockRes()

    await controller.getCreditLedgerHandler(mockReq() as any, res, next)

    expect(getCreditLedger).toHaveBeenCalledWith('user-1', {
      scope: 'USER',
      limit: 25,
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { entries: [] } }),
    )
  })

  it('passes through scope, limit (coerced from the query string) and cursor', async () => {
    ;(getCreditLedger as jest.Mock).mockResolvedValue({})
    const cursor = '00000000-0000-0000-0000-000000000009'

    await controller.getCreditLedgerHandler(
      mockReq({ query: { scope: 'TEAM', limit: '50', cursor } }) as any,
      mockRes(),
      next,
    )

    expect(getCreditLedger).toHaveBeenCalledWith('user-1', {
      scope: 'TEAM',
      limit: 50,
      cursor,
    })
  })

  it.each([
    [{ limit: '0' }],
    [{ limit: '101' }],
    [{ limit: 'abc' }],
    [{ scope: 'ORG' }],
    [{ cursor: 'not-a-uuid' }],
  ])('rejects an invalid query %j', async (query) => {
    await controller.getCreditLedgerHandler(
      mockReq({ query }) as any,
      mockRes(),
      next,
    )
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(getCreditLedger).not.toHaveBeenCalled()
  })

  it('forwards service errors', async () => {
    ;(getCreditLedger as jest.Mock).mockRejectedValue(new Error('boom'))
    await controller.getCreditLedgerHandler(mockReq() as any, mockRes(), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getMyUsageHandler', () => {
  it("returns the caller's usage summary, scoped to the authenticated user", async () => {
    ;(getMyUsage as jest.Mock).mockResolvedValue({ plan: 'PRO', metered: true })
    const res = mockRes()

    // Any user id smuggled in the query/body is ignored: only the token's user counts.
    await controller.getMyUsageHandler(
      mockReq({
        query: { userId: 'someone-else' },
        body: { userId: 'x' },
      }) as any,
      res,
      next,
    )

    expect(getMyUsage).toHaveBeenCalledWith('user-1')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: { plan: 'PRO', metered: true },
      }),
    )
  })

  it('forwards errors', async () => {
    ;(getMyUsage as jest.Mock).mockRejectedValue(new Error('boom'))
    await controller.getMyUsageHandler(mockReq() as any, mockRes(), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getUsageHistoryHandler', () => {
  it('defaults to the current cycle in UTC and scopes to the authenticated user', async () => {
    ;(getUsageHistory as jest.Mock).mockResolvedValue({ metered: true })
    const res = mockRes()

    // A user id smuggled into the query is ignored: only the token's user counts.
    await controller.getUsageHistoryHandler(
      mockReq({ query: { userId: 'someone-else' } }) as any,
      res,
      next,
    )

    expect(getUsageHistory).toHaveBeenCalledWith('user-1', 'current', 'UTC')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Usage history fetched',
        data: { metered: true },
      }),
    )
  })

  it('passes the requested range and time zone through', async () => {
    ;(getUsageHistory as jest.Mock).mockResolvedValue({})
    await controller.getUsageHistoryHandler(
      mockReq({ query: { range: 'previous', tz: 'Asia/Karachi' } }) as any,
      mockRes(),
      next,
    )
    expect(getUsageHistory).toHaveBeenCalledWith(
      'user-1',
      'previous',
      'Asia/Karachi',
    )
  })

  it.each([
    { range: 'last-year' },
    { tz: 'Mars/Olympus' },
    { tz: '+05:00' },
    { tz: "UTC'; DROP TABLE usage_events;--" },
  ])(
    'rejects an invalid query (%o) before touching the service',
    async (query) => {
      ;(getUsageHistory as jest.Mock).mockClear()
      await controller.getUsageHistoryHandler(
        mockReq({ query }) as any,
        mockRes(),
        next,
      )
      expect(getUsageHistory).not.toHaveBeenCalled()
      expect(next).toHaveBeenCalledWith(expect.any(Error))
    },
  )

  it('forwards service errors', async () => {
    ;(getUsageHistory as jest.Mock).mockRejectedValue(new Error('boom'))
    await controller.getUsageHistoryHandler(mockReq() as any, mockRes(), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('listTeamTransactionsHandler', () => {
  it('applies defaults and returns the page', async () => {
    ;(listTeamTransactions as jest.Mock).mockResolvedValue({ entries: [] })
    const res = mockRes()
    await controller.listTeamTransactionsHandler(mockReq() as any, res, next)

    expect(listTeamTransactions).toHaveBeenCalledWith('user-1', { limit: 25 })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Billing history fetched',
        data: { entries: [] },
      }),
    )
  })

  it('coerces the limit and passes the cursor', async () => {
    ;(listTeamTransactions as jest.Mock).mockResolvedValue({})
    const cursor = '00000000-0000-0000-0000-000000000009'
    await controller.listTeamTransactionsHandler(
      mockReq({ query: { limit: '50', cursor } }) as any,
      mockRes(),
      next,
    )
    expect(listTeamTransactions).toHaveBeenCalledWith('user-1', {
      limit: 50,
      cursor,
    })
  })

  it.each([[{ limit: '0' }], [{ limit: '101' }], [{ cursor: 'nope' }]])(
    'rejects an invalid query %j',
    async (query) => {
      await controller.listTeamTransactionsHandler(
        mockReq({ query }) as any,
        mockRes(),
        next,
      )
      expect(next).toHaveBeenCalledWith(expect.any(Error))
      expect(listTeamTransactions).not.toHaveBeenCalled()
    },
  )

  it('forwards service errors', async () => {
    ;(listTeamTransactions as jest.Mock).mockRejectedValue(new Error('boom'))
    await controller.listTeamTransactionsHandler(
      mockReq() as any,
      mockRes(),
      next,
    )
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getTeamReceiptHandler', () => {
  const id = '00000000-0000-0000-0000-000000000007'

  it('returns the receipt for a valid id', async () => {
    ;(getTeamReceipt as jest.Mock).mockResolvedValue({ id })
    const res = mockRes()
    await controller.getTeamReceiptHandler(
      mockReq({ params: { id } }) as any,
      res,
      next,
    )
    expect(getTeamReceipt).toHaveBeenCalledWith('user-1', id)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Receipt fetched',
        data: { id },
      }),
    )
  })

  it('rejects a malformed id before touching the service', async () => {
    await controller.getTeamReceiptHandler(
      mockReq({ params: { id: 'nope' } }) as any,
      mockRes(),
      next,
    )
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(getTeamReceipt).not.toHaveBeenCalled()
  })

  it('forwards service errors', async () => {
    ;(getTeamReceipt as jest.Mock).mockRejectedValue(new Error('gone'))
    await controller.getTeamReceiptHandler(
      mockReq({ params: { id } }) as any,
      mockRes(),
      next,
    )
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
