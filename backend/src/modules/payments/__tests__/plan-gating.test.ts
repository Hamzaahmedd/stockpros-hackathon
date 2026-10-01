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
import { PlanRequiredError, QuotaExceededError } from '../../../shared/errors'

jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    watchlist: { count: jest.fn(), findFirst: jest.fn() },
    portfolio: { count: jest.fn() },
  },
}))

jest.mock('../../../shared/infrastructure/usage-quota', () => ({
  incrementAndCheckQuota: jest.fn(),
}))

jest.mock('../../access-control', () => ({
  rbacMiddleware: jest.fn(() => 'RBAC_MIDDLEWARE_MARKER'),
  Action: { READ: 'read', WRITE: 'write' },
  Resource: { CORE_APP: 'core_app', PORTFOLIO: 'portfolio' },
}))

jest.mock('../credits', () => ({
  consumeAiSignal: jest.fn(),
}))

jest.mock('../constants', () => ({
  MeteredFeature: { AI_FORECAST: 'ai_forecast', AI_DECISION: 'ai_decision' },
}))

jest.mock('../../../shared/infrastructure/team-access', () => ({
  getActiveMembership: jest.fn(),
}))

import { prisma } from '../../../shared/infrastructure/database'
import { incrementAndCheckQuota } from '../../../shared/infrastructure/usage-quota'
import { getActiveMembership } from '../../../shared/infrastructure/team-access'
import { Action, Resource } from '../../access-control'
import { MeteredFeature } from '../constants'
import { consumeAiSignal } from '../credits'
import { OverageReason, OverageRequiredError } from '../../../shared/errors'
import {
  attachTeamContext,
  composeHandlers,
  meterPaidAiSignal,
  QUEUE_PRIORITY_HEADER,
  QueuePriority,
  gate,
  noTierRestriction,
  requireAlertTypeAllowedForPlan,
  requirePlan,
  requirePlanOrQuota,
  requireSinglePortfolioForFree,
  requireWatchlistLimitForFree,
  requireWatchlistMembershipOrPro,
} from '../plan-gating'

function mockReqRes(
  plan: 'FREE' | 'PRO' | 'TEAM',
  extra: Record<string, any> = {},
) {
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

  it('does not set the quota header when remaining is null (quota check unavailable)', async () => {
    ;(incrementAndCheckQuota as jest.Mock).mockResolvedValue({
      allowed: true,
      remaining: null,
      resetAt: null,
    })
    const { req, res, next } = mockReqRes('FREE')
    await requirePlanOrQuota('forecast', 1)(req, res, next)
    expect(res.setHeader).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it('forwards an unexpected error from the quota check to next()', async () => {
    const quotaError = new Error('redis down')
    ;(incrementAndCheckQuota as jest.Mock).mockRejectedValue(quotaError)
    const { req, res, next } = mockReqRes('FREE')
    await requirePlanOrQuota('forecast', 1)(req, res, next)
    expect(next).toHaveBeenCalledWith(quotaError)
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

  it('passes a FREE user through when no symbol is present on the request at all', async () => {
    const { req, res, next } = mockReqRes('FREE')
    await requireWatchlistMembershipOrPro(req, res, next)
    expect(prisma.watchlist.findFirst).not.toHaveBeenCalled()
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
  it('passes PRO users through without querying the DB', async () => {
    const { req, res, next } = mockReqRes('PRO')
    await requireSinglePortfolioForFree(req, res, next)
    expect(prisma.portfolio.count).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

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

describe('TEAM plan counts as paid', () => {
  it('passes TEAM users through requirePlan', () => {
    const { req, res, next } = mockReqRes('TEAM')
    requirePlan('PRO')(req, res, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('skips the daily quota for TEAM and PRO', async () => {
    for (const plan of ['TEAM', 'PRO'] as const) {
      const { req, res, next } = mockReqRes(plan)
      await requirePlanOrQuota('forecast', 1)(req, res, next)
      expect(next).toHaveBeenCalledWith()
    }
    expect(incrementAndCheckQuota).not.toHaveBeenCalled()
    expect(consumeAiSignal).not.toHaveBeenCalled()
  })

  it('passes TEAM users through the FREE-only limits', async () => {
    const { req, res, next } = mockReqRes('TEAM')
    await requireWatchlistLimitForFree(req, res, next)
    expect(prisma.watchlist.count).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })
})

describe('requirePlanOrQuota with metered feature', () => {
  it('delegates paid users to metering with the symbol', async () => {
    ;(getActiveMembership as jest.Mock).mockResolvedValue(null)
    const { req, res, next } = mockReqRes('PRO', { params: { symbol: 'AAPL' } })
    await requirePlanOrQuota('forecast', 1, MeteredFeature.AI_FORECAST)(
      req,
      res,
      next,
    )
    expect(consumeAiSignal).toHaveBeenCalledWith(
      { userId: 'user-1', membership: null },
      MeteredFeature.AI_FORECAST,
      'AAPL',
    )
    expect(incrementAndCheckQuota).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it('still applies the daily quota to FREE users', async () => {
    ;(incrementAndCheckQuota as jest.Mock).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: '2026-01-01T00:00:00.000Z',
    })
    const { req, res, next } = mockReqRes('FREE')
    await requirePlanOrQuota('forecast', 1, MeteredFeature.AI_FORECAST)(
      req,
      res,
      next,
    )
    expect(consumeAiSignal).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(expect.any(QuotaExceededError))
  })
})

describe('composeHandlers', () => {
  const tick = () => new Promise((resolve) => setImmediate(resolve))

  it('runs handlers in order then calls next', () => {
    const order: number[] = []
    const a = jest.fn((_req, _res, n) => {
      order.push(1)
      n()
    })
    const b = jest.fn((_req, _res, n) => {
      order.push(2)
      n()
    })
    const { req, res, next } = mockReqRes('PRO')
    composeHandlers(a, b)(req, res, next)
    expect(order).toEqual([1, 2])
    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith(undefined)
  })

  it('calls next straight away with no handlers', () => {
    const { req, res, next } = mockReqRes('PRO')
    composeHandlers()(req, res, next)
    expect(next).toHaveBeenCalledWith(undefined)
  })

  it('stops at the first handler that passes an error', () => {
    const boom = new Error('boom')
    const a = jest.fn((_req, _res, n) => n(boom))
    const b = jest.fn()
    const { req, res, next } = mockReqRes('PRO')
    composeHandlers(a, b)(req, res, next)
    expect(b).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(boom)
  })

  it('forwards synchronously thrown errors', () => {
    const boom = new Error('sync')
    const a = jest.fn(() => {
      throw boom
    })
    const b = jest.fn()
    const { req, res, next } = mockReqRes('PRO')
    composeHandlers(a, b)(req, res, next)
    expect(b).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(boom)
  })

  it('forwards rejected promises from async handlers', async () => {
    const boom = new Error('async')
    const a = jest.fn(async () => {
      throw boom
    })
    const { req, res, next } = mockReqRes('PRO')
    composeHandlers(a as never)(req, res, next)
    await tick()
    expect(next).toHaveBeenCalledWith(boom)
  })

  it('continues after an async handler that calls next', async () => {
    const a = jest.fn(async (_req, _res, n) => n())
    const b = jest.fn((_req, _res, n) => n())
    const { req, res, next } = mockReqRes('PRO')
    composeHandlers(a as never, b)(req, res, next)
    await tick()
    expect(b).toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(undefined)
  })
})

describe('attachTeamContext', () => {
  const membership = {
    teamId: 't1',
    role: 'MEMBER',
    monthlyCreditLimitPaisa: null,
    orgInstructions: 'Be brief',
  }
  // Wed 2026-07-15 (EDT): 13:30Z = 09:30 ET (spike), 16:00Z = 12:00 ET (quiet)
  const SPIKE = new Date('2026-07-15T13:30:00Z')
  const QUIET = new Date('2026-07-15T16:00:00Z')

  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('sets HIGH priority and header for a member inside the spike window', async () => {
    jest.setSystemTime(SPIKE)
    ;(getActiveMembership as jest.Mock).mockResolvedValue(membership)
    const { req, res, next } = mockReqRes('TEAM')
    await attachTeamContext(req, res, next)
    expect(req.teamContext).toEqual({
      membership,
      priority: QueuePriority.HIGH,
      isHighPriority: true,
    })
    expect(res.setHeader).toHaveBeenCalledWith(QUEUE_PRIORITY_HEADER, 'HIGH')
    expect(next).toHaveBeenCalledWith()
  })

  it('sets NORMAL priority for a member outside the spike window', async () => {
    jest.setSystemTime(QUIET)
    ;(getActiveMembership as jest.Mock).mockResolvedValue(membership)
    const { req, res, next } = mockReqRes('TEAM')
    await attachTeamContext(req, res, next)
    expect(req.teamContext.priority).toBe(QueuePriority.NORMAL)
    expect(req.teamContext.isHighPriority).toBe(false)
    expect(res.setHeader).toHaveBeenCalledWith(QUEUE_PRIORITY_HEADER, 'NORMAL')
  })

  it('stops flagging members as high priority the moment the emergency halt is switched on, and resumes when cleared', async () => {
    const { setEmergencyClosed } = jest.requireActual(
      '../../../shared/utils/market-hours',
    )
    jest.setSystemTime(SPIKE)
    ;(getActiveMembership as jest.Mock).mockResolvedValue(membership)

    try {
      setEmergencyClosed(true)
      const halted = mockReqRes('TEAM')
      await attachTeamContext(halted.req, halted.res, halted.next)
      expect(halted.req.teamContext.isHighPriority).toBe(false)
      expect(halted.req.teamContext.priority).toBe(QueuePriority.NORMAL)

      setEmergencyClosed(false)
      const live = mockReqRes('TEAM')
      await attachTeamContext(live.req, live.res, live.next)
      expect(live.req.teamContext.isHighPriority).toBe(true)
    } finally {
      setEmergencyClosed(false)
    }
  })

  it('does not flag a member as high priority inside a spike-hour on an NYSE holiday', async () => {
    // Thanksgiving 2026, 09:45 ET (EST, UTC-5) — the market is closed all day.
    jest.setSystemTime(new Date('2026-11-26T14:45:00Z'))
    ;(getActiveMembership as jest.Mock).mockResolvedValue(membership)
    const { req, res, next } = mockReqRes('TEAM')
    await attachTeamContext(req, res, next)
    expect(req.teamContext.priority).toBe(QueuePriority.NORMAL)
    expect(req.teamContext.isHighPriority).toBe(false)
    expect(res.setHeader).toHaveBeenCalledWith(QUEUE_PRIORITY_HEADER, 'NORMAL')
  })

  it('does not set the header or HIGH priority for non-members', async () => {
    jest.setSystemTime(SPIKE)
    ;(getActiveMembership as jest.Mock).mockResolvedValue(null)
    const { req, res, next } = mockReqRes('TEAM')
    await attachTeamContext(req, res, next)
    expect(req.teamContext).toEqual({
      membership: null,
      priority: QueuePriority.NORMAL,
      isHighPriority: false,
    })
    expect(res.setHeader).not.toHaveBeenCalled()
  })

  it('skips the membership lookup for non-TEAM plans', async () => {
    jest.setSystemTime(SPIKE)
    const { req, res, next } = mockReqRes('PRO')
    await attachTeamContext(req, res, next)
    expect(getActiveMembership).not.toHaveBeenCalled()
    expect(req.teamContext.membership).toBeNull()
    expect(res.setHeader).not.toHaveBeenCalled()
  })

  it('reuses an existing teamContext without another lookup', async () => {
    jest.setSystemTime(SPIKE)
    const { req, res, next } = mockReqRes('TEAM', {
      teamContext: { membership, priority: QueuePriority.NORMAL },
    })
    await attachTeamContext(req, res, next)
    expect(getActiveMembership).not.toHaveBeenCalled()
    expect(req.teamContext.priority).toBe(QueuePriority.HIGH)
  })

  it('forwards lookup failures to next', async () => {
    const boom = new Error('db')
    ;(getActiveMembership as jest.Mock).mockRejectedValue(boom)
    const { req, res, next } = mockReqRes('TEAM')
    await attachTeamContext(req, res, next)
    expect(next).toHaveBeenCalledWith(boom)
  })
})

describe('meterPaidAiSignal', () => {
  const membership = { teamId: 't1', role: 'MEMBER' }

  it('skips FREE users without metering', async () => {
    const { req, res, next } = mockReqRes('FREE')
    await meterPaidAiSignal(MeteredFeature.AI_DECISION)(req, res, next)
    expect(consumeAiSignal).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it('builds the actor with the TEAM membership', async () => {
    ;(getActiveMembership as jest.Mock).mockResolvedValue(membership)
    const { req, res, next } = mockReqRes('TEAM', { body: { symbol: 'MSFT' } })
    await meterPaidAiSignal(MeteredFeature.AI_DECISION)(req, res, next)
    expect(consumeAiSignal).toHaveBeenCalledWith(
      { userId: 'user-1', membership },
      MeteredFeature.AI_DECISION,
      'MSFT',
    )
    expect(next).toHaveBeenCalledWith()
  })

  it('uses a null membership for PRO users and reads the symbol from the query', async () => {
    const { req, res, next } = mockReqRes('PRO', { query: { symbol: 'TSLA' } })
    await meterPaidAiSignal(MeteredFeature.AI_FORECAST)(req, res, next)
    expect(getActiveMembership).not.toHaveBeenCalled()
    expect(consumeAiSignal).toHaveBeenCalledWith(
      { userId: 'user-1', membership: null },
      MeteredFeature.AI_FORECAST,
      'TSLA',
    )
  })

  it('prefers the route param symbol over body and query', async () => {
    const { req, res, next } = mockReqRes('PRO', {
      params: { symbol: 'AAPL' },
      body: { symbol: 'MSFT' },
      query: { symbol: 'TSLA' },
    })
    await meterPaidAiSignal(MeteredFeature.AI_FORECAST)(req, res, next)
    expect(consumeAiSignal).toHaveBeenCalledWith(
      expect.anything(),
      MeteredFeature.AI_FORECAST,
      'AAPL',
    )
  })

  it('forwards an OverageRequiredError to next', async () => {
    const overage = new OverageRequiredError({
      reason: OverageReason.INSUFFICIENT_CREDITS,
      feature: 'ai_forecast',
      canTopUp: true,
    })
    ;(consumeAiSignal as jest.Mock).mockRejectedValue(overage)
    const { req, res, next } = mockReqRes('PRO')
    await meterPaidAiSignal(MeteredFeature.AI_FORECAST)(req, res, next)
    expect(next).toHaveBeenCalledWith(overage)
  })
})
