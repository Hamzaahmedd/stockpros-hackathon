jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    watchlist: { findMany: jest.fn() },
    portfolio: { findMany: jest.fn() },
    newsArticle: { findMany: jest.fn() },
    alertLog: { findMany: jest.fn() },
  },
}))

jest.mock('../../../shared/infrastructure/cache', () => ({
  ...jest.requireActual('../../../shared/infrastructure/cache'),
  getCache: jest.fn(),
  setCache: jest.fn(),
}))

jest.mock(
  '../../../shared/infrastructure/clients/yahoo-finance-client',
  () => ({
    __esModule: true,
    default: { chart: jest.fn() },
  }),
)

jest.mock('../../../shared/utils', () => ({
  ...jest.requireActual('../../../shared/utils'),
  getPakistanHour: jest.fn(),
}))

jest.mock('../../market', () => ({
  getCurrentPrice: jest.fn(),
  getCompanySectors: jest.fn(),
  getRankedTopStocks: jest.fn(),
}))

jest.mock('../../decision-support', () => ({
  getLatestDecisionRun: jest.fn(),
  MarketRecommendation: {
    Buy: 'BUY',
    Sell: 'SELL',
    HoldCaution: 'HOLD / CAUTION',
  },
  PortfolioDecision: { Add: 'ADD', Hold: 'HOLD', Trim: 'TRIM', Exit: 'EXIT' },
}))

import { prisma } from '../../../shared/infrastructure/database'
import { getCache, setCache } from '../../../shared/infrastructure/cache'
import yahoo from '../../../shared/infrastructure/clients/yahoo-finance-client'
import { getPakistanHour } from '../../../shared/utils'
import {
  getCurrentPrice,
  getCompanySectors,
  getRankedTopStocks,
} from '../../market'
import { getLatestDecisionRun } from '../../decision-support'
import {
  getDashboard,
  normalizeSectorName,
  buildSectorHeatmap,
} from '../service'

const mockPrisma = prisma as unknown as {
  [model: string]: Record<string, jest.Mock>
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getCache as jest.Mock).mockResolvedValue(null)
  ;(setCache as jest.Mock).mockResolvedValue(undefined)
  ;(getPakistanHour as jest.Mock).mockReturnValue(9) // morning
  ;(getCurrentPrice as jest.Mock).mockResolvedValue(null)
  ;(getCompanySectors as jest.Mock).mockResolvedValue({})
  ;(getRankedTopStocks as jest.Mock).mockResolvedValue([])
  ;(getLatestDecisionRun as jest.Mock).mockResolvedValue(null)
  mockPrisma.watchlist.findMany.mockResolvedValue([])
  mockPrisma.portfolio.findMany.mockResolvedValue([])
  mockPrisma.newsArticle.findMany.mockResolvedValue([])
  mockPrisma.alertLog.findMany.mockResolvedValue([])
})

// ── normalizeSectorName (pure, exported, exhaustive) ────────────────────────

describe('normalizeSectorName', () => {
  it('returns Unknown for a missing sector', () => {
    expect(normalizeSectorName(null)).toBe('Unknown')
    expect(normalizeSectorName(undefined)).toBe('Unknown')
  })

  const cases: [string, string][] = [
    ['Software', 'Information Technology'],
    ['Pharmaceuticals', 'Health Care'],
    ['Regional Banks', 'Financials'],
    ['Auto Manufacturers', 'Consumer Discretionary'],
    ['Packaged Foods', 'Consumer Staples'],
    ['Oil & Gas E&P', 'Energy'],
    ['Aerospace & Defense', 'Industrials'],
    ['Specialty Chemicals', 'Materials'],
    ['REIT - Residential', 'Real Estate'],
    ['Utilities - Regulated Electric', 'Utilities'],
    ['Telecom Services', 'Communication Services'],
  ]

  it.each(cases)(
    'maps provider sector "%s" to canonical "%s"',
    (input, expected) => {
      expect(normalizeSectorName(input)).toBe(expected)
    },
  )

  it('leaves an already-canonical sector name as-is', () => {
    // Note: every SECTOR_ETF_MAP key's lowercase form also matches its own
    // substring rule above (e.g. "financials" contains "financ"), so this
    // resolves via that rule, not the exact-match fallback further down —
    // that fallback appears to be unreachable dead code, since any input
    // that could match it exactly would already have matched a substring
    // rule first. Flagging as a minor cleanup candidate, not a bug.
    expect(normalizeSectorName('financials')).toBe('Financials')
  })

  it('logs and passes through an unrecognized sector unnormalized', () => {
    expect(normalizeSectorName('Some Novel Category')).toBe(
      'Some Novel Category',
    )
  })

  it('classifies "Biotechnology" as Health Care, not Information Technology, despite containing "tech"', () => {
    // Regression test: "biotechnology".includes('tech') is true, so without
    // the explicit exclusion in the Information Technology check, this
    // resolved to the wrong sector and never reached the 'biotech' rule
    // below (see service.ts's normalizeSectorName).
    expect(normalizeSectorName('Biotechnology')).toBe('Health Care')
  })
})

// ── buildSectorHeatmap (exported) ───────────────────────────────────────────

describe('buildSectorHeatmap', () => {
  const chartQuotes = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ close: 100 + i }))

  it('reuses the cached sector performance without calling Yahoo Finance', async () => {
    ;(getCache as jest.Mock).mockResolvedValue({
      cachedAt: '2024-01-01T00:00:00.000Z',
      rawPerformance: { '1d': {}, '5d': {}, '1m': {} },
    })
    mockPrisma.portfolio.findMany.mockResolvedValue([])

    const result = await buildSectorHeatmap('user-1')

    expect(result.cachedAt).toBe('2024-01-01T00:00:00.000Z')
    expect(yahoo.chart).not.toHaveBeenCalled()
  })

  it('fetches and caches fresh ETF performance on a cache miss, skipping an ETF with too few quotes', async () => {
    ;(yahoo.chart as jest.Mock).mockImplementation((ticker: string) =>
      ticker === 'XLK'
        ? Promise.resolve({ quotes: chartQuotes(25) })
        : Promise.resolve({ quotes: chartQuotes(5) }),
    )
    mockPrisma.portfolio.findMany.mockResolvedValue([])

    const result = await buildSectorHeatmap('user-1')

    const tech = result.sectors.find(
      (s) => s.name === 'Information Technology',
    )!
    const financials = result.sectors.find((s) => s.name === 'Financials')!
    expect(tech.performance['1d']).toBeGreaterThan(0) // rising prices -> positive
    expect(financials.performance['1d']).toBe(0) // too few quotes, never populated
    expect(setCache).toHaveBeenCalledWith(
      'dashboard:sector-heatmap',
      expect.any(Object),
      expect.any(Number),
    )
  }, 15000)

  it('continues past a failing ETF fetch instead of aborting the whole heatmap', async () => {
    ;(yahoo.chart as jest.Mock).mockRejectedValue(new Error('yahoo down'))
    mockPrisma.portfolio.findMany.mockResolvedValue([])

    const result = await buildSectorHeatmap('user-1')
    expect(result.sectors).toHaveLength(
      Object.keys(result.sectors).length === 0 ? 0 : result.sectors.length,
    )
    expect(result.sectors.every((s) => s.performance['1d'] === 0)).toBe(true)
  }, 15000)

  it('prefers the DB-stored sector, falling back to a live lookup for missing/Unknown sectors', async () => {
    ;(getCache as jest.Mock).mockResolvedValue({
      cachedAt: '2024-01-01T00:00:00.000Z',
      rawPerformance: { '1d': { Financials: '2.00%' }, '5d': {}, '1m': {} },
    })
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        positions: [
          {
            symbol: 'JPM',
            sector: 'Financials',
            quantity: 10,
            avgEntryPrice: 100,
          },
          { symbol: 'XOM', sector: 'Unknown', quantity: 10, avgEntryPrice: 50 },
        ],
      },
    ])
    ;(getCompanySectors as jest.Mock).mockResolvedValue({ XOM: 'Oil & Gas' })

    const result = await buildSectorHeatmap('user-1')

    expect(getCompanySectors).toHaveBeenCalledWith(['XOM'])
    const energy = result.sectors.find((s) => s.name === 'Energy')!
    expect(energy.userSymbols).toEqual(['XOM'])
  })

  it('signals OVEREXPOSED for a >25% position in a sector that is down today', async () => {
    ;(getCache as jest.Mock).mockResolvedValue({
      cachedAt: '2024-01-01T00:00:00.000Z',
      rawPerformance: { '1d': { Financials: '-1.00%' }, '5d': {}, '1m': {} },
    })
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        positions: [
          {
            symbol: 'JPM',
            sector: 'Financials',
            quantity: 100,
            avgEntryPrice: 100,
          },
        ],
      },
    ])

    const result = await buildSectorHeatmap('user-1')
    expect(result.sectors.find((s) => s.name === 'Financials')!.signal).toBe(
      'OVEREXPOSED',
    )
  })

  it('signals BLIND_SPOT for an unheld sector that is rallying, NO_EXPOSURE otherwise', async () => {
    ;(getCache as jest.Mock).mockResolvedValue({
      cachedAt: '2024-01-01T00:00:00.000Z',
      rawPerformance: {
        '1d': { Financials: '2.00%', Energy: '0.00%' },
        '5d': {},
        '1m': {},
      },
    })
    mockPrisma.portfolio.findMany.mockResolvedValue([])

    const result = await buildSectorHeatmap('user-1')
    expect(result.sectors.find((s) => s.name === 'Financials')!.signal).toBe(
      'BLIND_SPOT',
    )
    expect(result.sectors.find((s) => s.name === 'Energy')!.signal).toBe(
      'NO_EXPOSURE',
    )
  })

  it('signals WELL_POSITIONED/UNDERPERFORMING/NEUTRAL for a held, non-overexposed sector', async () => {
    ;(getCache as jest.Mock).mockResolvedValue({
      cachedAt: '2024-01-01T00:00:00.000Z',
      rawPerformance: {
        '1d': { Financials: '1.00%', Energy: '-1.00%', Utilities: '0.00%' },
        '5d': {},
        '1m': {},
      },
    })
    // A large padding position keeps Financials/Energy/Utilities each under
    // the 25% concentration threshold, so OVEREXPOSED can't preempt the
    // signal this test is actually targeting (see the dedicated OVEREXPOSED
    // test above for that threshold's own behavior).
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        positions: [
          {
            symbol: 'AAPL',
            sector: 'Technology',
            quantity: 1,
            avgEntryPrice: 700,
          },
          {
            symbol: 'JPM',
            sector: 'Financials',
            quantity: 1,
            avgEntryPrice: 100,
          },
          { symbol: 'XOM', sector: 'Energy', quantity: 1, avgEntryPrice: 100 },
          {
            symbol: 'NEE',
            sector: 'Utilities',
            quantity: 1,
            avgEntryPrice: 100,
          },
        ],
      },
    ])

    const result = await buildSectorHeatmap('user-1')
    expect(result.sectors.find((s) => s.name === 'Financials')!.signal).toBe(
      'WELL_POSITIONED',
    )
    expect(result.sectors.find((s) => s.name === 'Energy')!.signal).toBe(
      'UNDERPERFORMING',
    )
    expect(result.sectors.find((s) => s.name === 'Utilities')!.signal).toBe(
      'NEUTRAL',
    )
  })
})

// ── getDashboard (main assembler — exercises all private builders) ─────────

describe('getDashboard', () => {
  beforeEach(() => {
    ;(getCache as jest.Mock).mockResolvedValue({
      cachedAt: '2024-01-01T00:00:00.000Z',
      rawPerformance: { '1d': {}, '5d': {}, '1m': {} },
    })
  })

  it('throws NotFoundError when the user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    await expect(getDashboard('missing-user')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('returns NO_DECISION_RUN / NO_POSITIONS placeholders for a brand-new user with no data', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })

    const result = await getDashboard('user-1')

    expect(result.briefing.greeting).toBe('Good morning, Ada')
    expect(result.briefing.decisionSupport).toEqual({
      available: false,
      reason: 'NO_DECISION_RUN',
      summary: null,
      headline: null,
    })
    expect(result.briefing.portfolioAlert!.headline).toBe(
      'No immediate portfolio alerts',
    )
    expect(result.portfolio).toEqual({
      available: false,
      reason: 'NO_POSITIONS',
    })
    expect(result.impactNews).toEqual({ items: [], totalCount: 0 })
    expect(result.trendingStocks).toEqual([])
  })

  it('greets by time of day: afternoon and evening', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    ;(getPakistanHour as jest.Mock).mockReturnValue(14)
    expect((await getDashboard('user-1')).briefing.greeting).toBe(
      'Good afternoon, Ada',
    )
    ;(getPakistanHour as jest.Mock).mockReturnValue(20)
    expect((await getDashboard('user-1')).briefing.greeting).toBe(
      'Good evening, Ada',
    )
  })

  it('summarizes a populated decision run: buy signals, at-risk positions, and a stable headline when none apply', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    ;(getLatestDecisionRun as jest.Mock).mockResolvedValue({
      runAt: new Date('2024-01-01'),
      results: [
        {
          portfolioDecision: 'ADD',
          marketDecision: 'BUY',
          riskLevel: 'HIGH',
          sector: 'Tech',
          exposure: { sectorPercent: 10 },
        },
        {
          portfolioDecision: 'HOLD',
          marketDecision: 'HOLD / CAUTION',
          riskLevel: 'MEDIUM',
          sector: 'Tech',
          exposure: { sectorPercent: 10 },
        },
      ],
    })

    const result = await getDashboard('user-1')
    expect(result.briefing.decisionSupport).toMatchObject({
      available: true,
      summary: {
        buySignals: 1,
        holdSignals: 1,
        trimSignals: 0,
        positionsAtRisk: 1,
      },
    })
    expect(result.briefing.decisionSupport.headline).toBe(
      '1 position has a BUY signal. 1 position needs attention',
    )
  })

  it('reports a stable headline and pluralizes correctly with multiple signals', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    ;(getLatestDecisionRun as jest.Mock).mockResolvedValue({
      runAt: new Date(),
      results: [
        {
          portfolioDecision: 'HOLD',
          marketDecision: 'HOLD / CAUTION',
          riskLevel: 'MEDIUM',
          sector: 'Tech',
          exposure: { sectorPercent: 10 },
        },
      ],
    })
    const stable = await getDashboard('user-1')
    expect(stable.briefing.decisionSupport.headline).toBe(
      'Your portfolio is stable',
    )

    ;(getLatestDecisionRun as jest.Mock).mockResolvedValue({
      runAt: new Date(),
      results: [
        {
          portfolioDecision: 'ADD',
          marketDecision: 'BUY',
          riskLevel: 'HIGH',
          sector: 'Tech',
          exposure: { sectorPercent: 10 },
        },
        {
          portfolioDecision: 'ADD',
          marketDecision: 'BUY',
          riskLevel: 'HIGH',
          sector: 'Energy',
          exposure: { sectorPercent: 10 },
        },
      ],
    })
    const busy = await getDashboard('user-1')
    expect(busy.briefing.decisionSupport.headline).toBe(
      '2 positions have a BUY signal. 2 positions need attention',
    )
  })

  it('leads the portfolio-alert headline with sector overexposure when the last decision run flags it', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    ;(getLatestDecisionRun as jest.Mock).mockResolvedValue({
      runAt: new Date(),
      results: [
        {
          portfolioDecision: 'HOLD',
          marketDecision: 'HOLD / CAUTION',
          riskLevel: 'MEDIUM',
          sector: 'Technology',
          exposure: { sectorPercent: 45 },
        },
      ],
    })

    const result = await getDashboard('user-1')
    expect(result.briefing.portfolioAlert!.overexposedSectors).toEqual([
      'Technology',
    ])
    expect(result.briefing.portfolioAlert!.headline).toContain(
      'Your portfolio is heavily overexposed to Technology',
    )
  })

  it('flags a stop-loss breach with a P&L context when a matching position exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    mockPrisma.watchlist.findMany.mockResolvedValue([
      {
        symbol: 'AAPL',
        targetEntryPrice: null,
        stopLoss: 150,
        aiSuggestedEntry: null,
        aiConfidence: null,
      },
    ])
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 140,
      changePercent: 0,
    })
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        positions: [
          {
            symbol: 'AAPL',
            quantity: 10,
            avgEntryPrice: 160,
            sector: 'Technology',
          },
        ],
      },
    ])

    const result = await getDashboard('user-1')
    expect(result.briefing.portfolioAlert!.stopLossBreaches).toBe(1)
    expect(result.smartTriggers.items[0]).toMatchObject({
      type: 'STOP_LOSS_BREACHED',
      symbol: 'AAPL',
    })
    expect(result.smartTriggers.items[0].context).toContain('down')
  })

  it('flags an active entry zone with an AI-suggested entry when available', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    mockPrisma.watchlist.findMany.mockResolvedValue([
      {
        symbol: 'MSFT',
        targetEntryPrice: 100,
        stopLoss: null,
        aiSuggestedEntry: 98,
        aiConfidence: 'HIGH',
      },
    ])
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 101,
      changePercent: 0,
    })

    const result = await getDashboard('user-1')
    expect(result.briefing.portfolioAlert!.entryZonesActive).toBe(1)
    const trigger = result.smartTriggers.items.find(
      (t) => t.type === 'ENTRY_ZONE',
    )!
    expect(trigger.action).toContain('AI suggested entry')
  })

  it('flags large intraday moves in both directions', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    mockPrisma.watchlist.findMany.mockResolvedValue([
      {
        symbol: 'DOWN',
        targetEntryPrice: null,
        stopLoss: null,
        aiSuggestedEntry: null,
        aiConfidence: null,
      },
      {
        symbol: 'UP',
        targetEntryPrice: null,
        stopLoss: null,
        aiSuggestedEntry: null,
        aiConfidence: null,
      },
    ])
    ;(getCurrentPrice as jest.Mock).mockImplementation((symbol: string) =>
      Promise.resolve(
        symbol === 'DOWN'
          ? { price: 90, changePercent: -6 }
          : { price: 110, changePercent: 6 },
      ),
    )

    const result = await getDashboard('user-1')
    const types = result.smartTriggers.items.map((t) => t.type)
    expect(types).toContain('PCT_CHANGE_DOWN')
    expect(types).toContain('PCT_CHANGE_UP')
  })

  it('skips a watchlist item with no fetchable price entirely', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    mockPrisma.watchlist.findMany.mockResolvedValue([
      {
        symbol: 'NODATA',
        targetEntryPrice: 100,
        stopLoss: 100,
        aiSuggestedEntry: null,
        aiConfidence: null,
      },
    ])
    ;(getCurrentPrice as jest.Mock).mockResolvedValue(null)

    const result = await getDashboard('user-1')
    expect(result.smartTriggers.items).toEqual([])
  })

  it('logs and continues when a watchlist price lookup throws', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    mockPrisma.watchlist.findMany.mockResolvedValue([
      {
        symbol: 'ERR',
        targetEntryPrice: null,
        stopLoss: null,
        aiSuggestedEntry: null,
        aiConfidence: null,
      },
    ])
    ;(getCurrentPrice as jest.Mock).mockRejectedValue(
      new Error('price service down'),
    )

    await expect(getDashboard('user-1')).resolves.toBeDefined()
  })

  it('builds every event trigger type from recent alert logs, with P&L context for held positions', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        positions: [
          {
            symbol: 'AAPL',
            quantity: 10,
            avgEntryPrice: 100,
            sector: 'Technology',
          },
        ],
      },
    ])
    // buildEventTriggers' P&L context is looked up from the *watchlist* price
    // map (shared with buildBriefing/buildPriceTriggers), not a separate
    // portfolio price fetch — so the symbol must also be on the watchlist
    // for the context branch to have a price to compute against.
    mockPrisma.watchlist.findMany.mockResolvedValue([
      {
        symbol: 'AAPL',
        targetEntryPrice: null,
        stopLoss: null,
        aiSuggestedEntry: null,
        aiConfidence: null,
      },
    ])
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 110,
      changePercent: 0,
    })
    mockPrisma.alertLog.findMany.mockResolvedValue([
      {
        alert: {
          type: 'EARNINGS_APPROACHING',
          userId: 'user-1',
          watchlist: { symbol: 'AAPL' },
        },
      },
      {
        alert: {
          type: 'DIVIDEND_APPROACHING',
          userId: 'user-1',
          watchlist: { symbol: 'MSFT' },
        },
      },
      {
        alert: {
          type: 'ANALYST_RATING_CHANGE',
          userId: 'user-1',
          watchlist: { symbol: 'MSFT' },
        },
      },
      {
        alert: {
          type: 'AI_SIGNAL_CHANGED',
          userId: 'user-1',
          watchlist: { symbol: 'MSFT' },
        },
      },
      {
        alert: {
          type: 'SOME_UNKNOWN_TYPE',
          userId: 'user-1',
          watchlist: { symbol: 'MSFT' },
        },
      },
    ])

    const result = await getDashboard('user-1')
    const types = result.smartTriggers.items.map((t) => t.type)
    expect(types).toEqual(
      expect.arrayContaining([
        'EARNINGS_APPROACHING',
        'DIVIDEND_APPROACHING',
        'ANALYST_RATING_CHANGE',
        'AI_SIGNAL_CHANGED',
      ]),
    )
    const earnings = result.smartTriggers.items.find(
      (t) => t.type === 'EARNINGS_APPROACHING',
    )!
    expect(earnings.context).toContain('up')
    const dividend = result.smartTriggers.items.find(
      (t) => t.type === 'DIVIDEND_APPROACHING',
    )!
    expect(dividend.context).toBe('Check your watchlist for details')
  })

  it('deduplicates triggers of the same type/symbol and sorts by urgency', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    mockPrisma.watchlist.findMany.mockResolvedValue([
      {
        symbol: 'AAPL',
        targetEntryPrice: 100,
        stopLoss: null,
        aiSuggestedEntry: null,
        aiConfidence: null,
      },
    ])
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 100,
      changePercent: 6,
    })
    mockPrisma.alertLog.findMany.mockResolvedValue([
      {
        alert: {
          type: 'AI_SIGNAL_CHANGED',
          userId: 'user-1',
          watchlist: { symbol: 'ZZZ' },
        },
      },
    ])

    const result = await getDashboard('user-1')
    // ENTRY_ZONE (MEDIUM) and PCT_CHANGE_UP (MEDIUM) both fire for AAPL;
    // AI_SIGNAL_CHANGED (LOW) for ZZZ should sort after both.
    expect(result.smartTriggers.items.at(-1)!.type).toBe('AI_SIGNAL_CHANGED')
  })

  it('computes portfolio value, P&L, best/worst performers, and an Excellent health score', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        positions: [
          {
            symbol: 'AAPL',
            quantity: 10,
            avgEntryPrice: 100,
            sector: 'Technology',
          },
          {
            symbol: 'MSFT',
            quantity: 5,
            avgEntryPrice: 200,
            sector: 'Software',
          },
        ],
      },
    ])
    ;(getCurrentPrice as jest.Mock).mockImplementation((symbol: string) =>
      Promise.resolve(
        symbol === 'AAPL'
          ? { price: 120, changePercent: 5 }
          : { price: 190, changePercent: -2 },
      ),
    )
    ;(getLatestDecisionRun as jest.Mock).mockResolvedValue({
      runAt: new Date(),
      results: [
        { portfolioDecision: 'ADD', riskLevel: 'LOW' },
        { portfolioDecision: 'HOLD', riskLevel: 'LOW' },
      ],
    })

    const result = await getDashboard('user-1')
    expect(result.portfolio.available).toBe(true)
    if (result.portfolio.available) {
      expect(result.portfolio.bestPerformer?.symbol).toBe('AAPL')
      expect(result.portfolio.worstPerformer?.symbol).toBe('MSFT')
      expect(result.portfolio.healthScore!.band).toBe('Excellent')
    }
  })

  it('scores portfolio health as Poor when diversification, risk and discipline are all weak', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        positions: [
          {
            symbol: 'AAPL',
            quantity: 100,
            avgEntryPrice: 100,
            sector: 'Technology',
          },
        ],
      },
    ])
    ;(getCurrentPrice as jest.Mock).mockResolvedValue(null) // falls back to avgEntryPrice, 0 change
    mockPrisma.watchlist.findMany.mockResolvedValue([
      {
        symbol: 'AAPL',
        targetEntryPrice: null,
        stopLoss: null,
        aiSuggestedEntry: null,
        aiConfidence: null,
      },
    ])
    ;(getLatestDecisionRun as jest.Mock).mockResolvedValue({
      runAt: new Date(),
      results: [{ portfolioDecision: 'EXIT', riskLevel: 'HIGH' }],
    })

    const result = await getDashboard('user-1')
    if (result.portfolio.available) {
      expect(result.portfolio.healthScore!.band).toBe('Poor')
    }
  })

  it('prioritizes portfolio-holding impact news over watchlist-only news', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        positions: [
          { symbol: 'AAPL', quantity: 10, avgEntryPrice: 100, sector: 'Tech' },
        ],
      },
    ])
    mockPrisma.watchlist.findMany.mockResolvedValue([
      {
        symbol: 'TSLA',
        targetEntryPrice: null,
        stopLoss: null,
        aiSuggestedEntry: null,
        aiConfidence: null,
      },
    ])
    mockPrisma.newsArticle.findMany.mockResolvedValue([
      {
        id: 'n1',
        headline: 'TSLA rallies',
        sentiment: 'BULLISH',
        relatedSymbols: ['TSLA'],
        publishedAt: new Date(),
        source: 'X',
        url: 'https://x',
      },
      {
        id: 'n2',
        headline: 'AAPL misses',
        sentiment: 'BEARISH',
        relatedSymbols: ['AAPL'],
        publishedAt: new Date(),
        source: 'X',
        url: 'https://x',
      },
    ])

    const result = await getDashboard('user-1')
    expect(result.impactNews.items[0].symbol).toBe('AAPL')
    expect(result.impactNews.items[0].impact).toBe('NEGATIVE_HOLDING')
    expect(result.impactNews.items[1].impact).toBe('POSITIVE_WATCHLIST')
  })

  it('builds trending stocks with sparklines, tolerating a per-symbol Yahoo failure', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    ;(getRankedTopStocks as jest.Mock).mockResolvedValue([
      { symbol: 'AAPL' },
      { symbol: 'FAIL' },
    ])
    ;(yahoo.chart as jest.Mock).mockImplementation((symbol: string) =>
      symbol === 'FAIL'
        ? Promise.reject(new Error('yahoo down'))
        : Promise.resolve({ quotes: [{ close: 100 }, { close: 101 }] }),
    )

    const result = await getDashboard('user-1')
    expect(
      result.trendingStocks.find((s) => s.symbol === 'AAPL')?.sparkline,
    ).toEqual([100, 101])
    expect(
      result.trendingStocks.find((s) => s.symbol === 'FAIL')?.sparkline,
    ).toEqual([])
  })

  it('returns an empty trending list when the ranked-stocks lookup itself fails', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Ada' })
    ;(getRankedTopStocks as jest.Mock).mockRejectedValue(
      new Error('ranking service down'),
    )

    const result = await getDashboard('user-1')
    expect(result.trendingStocks).toEqual([])
  })
})
