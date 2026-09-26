/**
 * Unit tests for the Free/Pro tier-gating middlewares.
 *
 * Strategy: mock Prisma and the Redis-backed quota helper so each middleware
 * is exercised in isolation (no DB/Redis needed), mirroring the mocking
 * style in phone-verification.route-registration.test.ts. `gate()` itself is
 * tested by toggling `config.features.pricingTiersEnabled` at runtime —
 * config is a plain object, so this is safe to do and restore per test.
 */
import config from '@/config'
import { PlanRequiredError, QuotaExceededError } from '../errors'

jest.mock('../infrastructure/database', () => ({
  prisma: {
    watchlist: { count: jest.fn(), findFirst: jest.fn() },
    portfolio: { count: jest.fn() },
  },
}))

jest.mock('../infrastructure/usage-quota', () => ({
  incrementAndCheckQuota: jest.fn(),
}))

jest.mock('../../modules/access-control', () => ({
  rbacMiddleware: jest.fn(() => 'RBAC_MIDDLEWARE_MARKER'),
  Action: { READ: 'read', WRITE: 'write' },
  Resource: { CORE_APP: 'core_app', PORTFOLIO: 'portfolio' },
}))

import { prisma } from '../infrastructure/database'
import { incrementAndCheckQuota } from '../infrastructure/usage-quota'
import { Action, Resource } from '../../modules/access-control'
import {
  gate,
  noTierRestriction,
  requireAlertTypeAllowedForPlan,
  requirePlan,
  requirePlanOrQuota,
  requireSinglePortfolioForFree,
  requireWatchlistLimitForFree,
  requireWatchlistMembershipOrPro,
} from './plan-gating'

function mockReqRes(plan: 'FREE' | 'PRO', extra: Record<string, any> = {}) {
  const req: any = {
    user: { userId: 'user-1', plan },
    params: {},
    body: {},
    query: {},
    ...extra,
  }
  const res: any = { setHeader: jest.fn() }
  const next = jest.fn()
  return { req, res, next }
}

const originalPricingTiersEnabled = config.features.pricingTiersEnabled

afterEach(() => {
  jest.clearAllMocks()
  ;(config.features as any).pricingTiersEnabled = originalPricingTiersEnabled
})

describe('gate', () => {
  it('uses rbacMiddleware when pricingTiersEnabled is off', () => {
    ;(config.features as any).pricingTiersEnabled = false
    const tierMiddleware = jest.fn()
    const selected = gate(Resource.CORE_APP, Action.READ, tierMiddleware)
    expect(selected).toBe('RBAC_MIDDLEWARE_MARKER')
  })

  it('uses the tier middleware when pricingTiersEnabled is on', () => {
    ;(config.features as any).pricingTiersEnabled = true
    const tierMiddleware = jest.fn()
    const selected = gate(Resource.CORE_APP, Action.READ, tierMiddleware)
    expect(selected).toBe(tierMiddleware)
  })
})

describe('noTierRestriction', () => {
  it('always calls next with no error', () => {
    const { req, res, next } = mockReqRes('FREE')
    noTierRestriction(req, res, next)
    expect(next).toHaveBeenCalledWith()
  })
})

describe('requirePlan', () => {
  it('passes PRO users through', () => {
    const { req, res, next } = mockReqRes('PRO')
    requirePlan('PRO')(req, res, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('blocks FREE users with a PlanRequiredError', () => {
    const { req, res, next } = mockReqRes('FREE')
    requirePlan('PRO')(req, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(PlanRequiredError))
    const err = next.mock.calls[0][0] as PlanRequiredError
    expect(err.details).toMatchObject({
      requiredPlan: 'PRO',
      reason: 'PRO_FEATURE',
    })
  })
})

describe('requirePlanOrQuota', () => {
  it('passes PRO users through without checking the quota', async () => {
    const { req, res, next } = mockReqRes('PRO')
    await requirePlanOrQuota('forecast', 1)(req, res, next)
    expect(incrementAndCheckQuota).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it('allows a FREE user within the daily limit', async () => {
    ;(incrementAndCheckQuota as jest.Mock).mockResolvedValue({
      allowed: true,
      remaining: 0,
      resetAt: '2026-01-01T00:00:00.000Z',
    })
    const { req, res, next } = mockReqRes('FREE')
    await requirePlanOrQuota('forecast', 1)(req, res, next)
    expect(incrementAndCheckQuota).toHaveBeenCalledWith('forecast', 'user-1', 1)
    expect(res.setHeader).toHaveBeenCalledWith('X-Quota-Remaining', '0')
    expect(next).toHaveBeenCalledWith()
  })

  it('blocks a FREE user over the daily limit with a QuotaExceededError', async () => {
    ;(incrementAndCheckQuota as jest.Mock).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: '2026-01-01T00:00:00.000Z',
    })
    const { req, res, next } = mockReqRes('FREE')
    await requirePlanOrQuota('forecast', 1)(req, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(QuotaExceededError))
    const err = next.mock.calls[0][0] as QuotaExceededError
    expect(err.details).toMatchObject({
      feature: 'forecast',
      limit: 1,
      remaining: 0,
    })
  })
})

describe('requireWatchlistLimitForFree', () => {
  it('passes PRO users through without querying the DB', async () => {
    const { req, res, next } = mockReqRes('PRO')
    await requireWatchlistLimitForFree(req, res, next)
    expect(prisma.watchlist.count).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it('allows a FREE user under the 10-symbol cap', async () => {
    ;(prisma.watchlist.count as jest.Mock).mockResolvedValue(9)
    const { req, res, next } = mockReqRes('FREE')
    await requireWatchlistLimitForFree(req, res, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('blocks a FREE user at the 10-symbol cap', async () => {
    ;(prisma.watchlist.count as jest.Mock).mockResolvedValue(10)
    const { req, res, next } = mockReqRes('FREE')
    await requireWatchlistLimitForFree(req, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(PlanRequiredError))
    const err = next.mock.calls[0][0] as PlanRequiredError
    expect(err.details).toMatchObject({ reason: 'WATCHLIST_LIMIT', limit: 10 })
  })
})

describe('requireWatchlistMembershipOrPro', () => {
  it('passes PRO users through for any symbol', async () => {
    const { req, res, next } = mockReqRes('PRO', { params: { symbol: 'AAPL' } })
    await requireWatchlistMembershipOrPro(req, res, next)
    expect(prisma.watchlist.findFirst).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it('allows a FREE user when the symbol is in their watchlist', async () => {
    ;(prisma.watchlist.findFirst as jest.Mock).mockResolvedValue({ id: 'w1' })
    const { req, res, next } = mockReqRes('FREE', {
      params: { symbol: 'aapl' },
    })
    await requireWatchlistMembershipOrPro(req, res, next)
    expect(prisma.watchlist.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', symbol: 'AAPL' },
      select: { id: true },
    })
    expect(next).toHaveBeenCalledWith()
  })

  it('blocks a FREE user when the symbol is not in their watchlist', async () => {
    ;(prisma.watchlist.findFirst as jest.Mock).mockResolvedValue(null)
    const { req, res, next } = mockReqRes('FREE', {
      params: { symbol: 'TSLA' },
    })
    await requireWatchlistMembershipOrPro(req, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(PlanRequiredError))
    const err = next.mock.calls[0][0] as PlanRequiredError
    expect(err.details).toMatchObject({
      reason: 'WATCHLIST_ONLY',
      symbol: 'TSLA',
    })
  })
})

describe('requireSinglePortfolioForFree', () => {
  it('allows a FREE user with no existing portfolio', async () => {
    ;(prisma.portfolio.count as jest.Mock).mockResolvedValue(0)
    const { req, res, next } = mockReqRes('FREE')
    await requireSinglePortfolioForFree(req, res, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('blocks a FREE user who already has a portfolio', async () => {
    ;(prisma.portfolio.count as jest.Mock).mockResolvedValue(1)
    const { req, res, next } = mockReqRes('FREE')
    await requireSinglePortfolioForFree(req, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(PlanRequiredError))
    const err = next.mock.calls[0][0] as PlanRequiredError
    expect(err.details).toMatchObject({ reason: 'PORTFOLIO_LIMIT', limit: 1 })
  })
})

describe('requireAlertTypeAllowedForPlan', () => {
  it('allows FREE users to create price/percentage alerts', () => {
    const { req, res, next } = mockReqRes('FREE', {
      body: { type: 'PRICE_ABOVE' },
    })
    requireAlertTypeAllowedForPlan(req, res, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('blocks FREE users from creating advanced alert types', () => {
    const { req, res, next } = mockReqRes('FREE', {
      body: { type: 'AI_SIGNAL_CHANGED' },
    })
    requireAlertTypeAllowedForPlan(req, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(PlanRequiredError))
  })

  it('allows PRO users to create any alert type', () => {
    const { req, res, next } = mockReqRes('PRO', {
      body: { type: 'AI_SIGNAL_CHANGED' },
    })
    requireAlertTypeAllowedForPlan(req, res, next)
    expect(next).toHaveBeenCalledWith()
  })
})
