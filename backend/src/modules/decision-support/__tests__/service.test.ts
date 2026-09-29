import * as xlsx from 'xlsx'
import { AnalystRating, MarketRecommendation, SentimentTrend } from '../types'

jest.mock('../../../shared/infrastructure/clients/finnhub-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))
jest.mock('../../../shared/infrastructure/clients/polygon-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))
jest.mock(
  '../../../shared/infrastructure/clients/yahoo-finance-client',
  () => ({
    __esModule: true,
    default: { chart: jest.fn() },
  }),
)
jest.mock('../../../shared/infrastructure/clients/fmp-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))
jest.mock('../../../shared/infrastructure/clients/twelve-data-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../../market', () => ({
  getLivePrices: jest.fn(),
  getCompanySectors: jest.fn(),
}))

jest.mock('../repository', () => ({
  persistDecisionRun: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    portfolio: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    position: {
      createMany: jest.fn(),
    },
  },
}))

jest.mock('../../../shared/infrastructure/cache', () => ({
  ...jest.requireActual('../../../shared/infrastructure/cache'),
  getCache: jest.fn(),
  setCache: jest.fn(),
}))

jest.mock('../../../shared/utils', () => ({
  ...jest.requireActual('../../../shared/utils'),
  getPakistanMonth: jest.fn(),
}))

import finnhubClient from '../../../shared/infrastructure/clients/finnhub-client'
import polygonClient from '../../../shared/infrastructure/clients/polygon-client'
import yahoo from '../../../shared/infrastructure/clients/yahoo-finance-client'
import fmpClient from '../../../shared/infrastructure/clients/fmp-client'
import twelveDataClient from '../../../shared/infrastructure/clients/twelve-data-client'
import { getLivePrices, getCompanySectors } from '../../market'
import { persistDecisionRun } from '../repository'
import { prisma } from '../../../shared/infrastructure/database'
import { getCache, setCache } from '../../../shared/infrastructure/cache'
import { getPakistanMonth } from '../../../shared/utils'
import * as service from '../service'

const mockGet = (client: unknown) => (client as { get: jest.Mock }).get
const mockPrisma = prisma as unknown as {
  [model: string]: Record<string, jest.Mock>
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getCache as jest.Mock).mockResolvedValue(null)
  ;(setCache as jest.Mock).mockResolvedValue(undefined)
  ;(getPakistanMonth as jest.Mock).mockReturnValue(1) // January — not an earnings month (0,3,6,9)
})

// ── Pure calculation functions ──────────────────────────────────────────────

describe('computeRSI', () => {
  it('falls back to 50 when there are no closes to compute from', () => {
    expect(service.computeRSI([])).toBe(50)
  })

  it('returns a value above 50 for a steadily rising price series', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i)
    expect(service.computeRSI(closes)).toBeGreaterThan(50)
  })

  it('returns a value below 50 for a steadily falling price series', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 200 - i)
    expect(service.computeRSI(closes)).toBeLessThan(50)
  })
})

describe('computeTrend', () => {
  it('returns UP when the short average exceeds the long average', () => {
    const closes = [
      ...Array.from({ length: 15 }, () => 100),
      110,
      111,
      112,
      113,
      114,
    ]
    expect(service.computeTrend(closes)).toBe('UP')
  })

  it('returns DOWN when the short average is below the long average', () => {
    const closes = [
      ...Array.from({ length: 15 }, () => 100),
      90,
      89,
      88,
      87,
      86,
    ]
    expect(service.computeTrend(closes)).toBe('DOWN')
  })

  it('returns FLAT when the short and long averages are equal', () => {
    const closes = Array.from({ length: 20 }, () => 100)
    expect(service.computeTrend(closes)).toBe('FLAT')
  })
})

describe('parseAnalystConsensus', () => {
  it('defaults to Hold with zero confidence when there is no data', () => {
    expect(service.parseAnalystConsensus([])).toEqual({
      rating: AnalystRating.Hold,
      confidencePercent: 0,
      sourceCount: 0,
    })
  })

  const cases: [number, number, number, number, number, string][] = [
    [9, 1, 0, 0, 0, AnalystRating.StrongBuy], // 100% bullish
    [6, 0, 4, 0, 0, AnalystRating.Buy], // 60% bullish
    [4, 0, 6, 0, 0, AnalystRating.Hold], // 40% bullish
    [2, 0, 8, 0, 0, AnalystRating.Sell], // 20% bullish
    [0, 0, 5, 5, 0, AnalystRating.StrongSell], // 0% bullish
  ]

  it.each(cases)(
    'strongBuy=%i buy=%i hold=%i sell=%i strongSell=%i -> %s',
    (strongBuy, buy, hold, sell, strongSell, expectedRating) => {
      const result = service.parseAnalystConsensus([
        { strongBuy, buy, hold, sell, strongSell },
      ])
      expect(result.rating).toBe(expectedRating)
      expect(result.sourceCount).toBe(
        strongBuy + buy + hold + sell + strongSell,
      )
    },
  )
})

describe('computeSentiment', () => {
  it('returns a neutral zero result for an empty feed', () => {
    expect(service.computeSentiment([], 'AAPL')).toEqual({
      score: 0,
      trend: SentimentTrend.Flat,
      change48hPercent: 0,
      newsVolume: 0,
    })
  })

  it('trends UP when the ticker-specific weighted score is strongly positive', () => {
    const feed = [
      {
        ticker_sentiment: [
          {
            ticker: 'AAPL',
            ticker_sentiment_score: '0.9',
            relevance_score: '1.0',
          },
        ],
      },
      {
        ticker_sentiment: [
          {
            ticker: 'AAPL',
            ticker_sentiment_score: '0.9',
            relevance_score: '1.0',
          },
        ],
      },
    ]
    const result = service.computeSentiment(feed, 'AAPL')
    expect(result.trend).toBe(SentimentTrend.Up)
    expect(result.newsVolume).toBe(2)
  })

  it('trends DOWN when the ticker-specific weighted score is strongly negative', () => {
    const feed = [
      {
        ticker_sentiment: [
          {
            ticker: 'AAPL',
            ticker_sentiment_score: '-0.9',
            relevance_score: '1.0',
          },
        ],
      },
    ]
    expect(service.computeSentiment(feed, 'AAPL').trend).toBe(
      SentimentTrend.Down,
    )
  })

  it('falls back to a diluted overall-sentiment score when the ticker has no per-ticker data', () => {
    const feed = [{ overall_sentiment_score: 0.5, ticker_sentiment: [] }]
    const result = service.computeSentiment(feed, 'AAPL')
    // 0.5 * 0.1 dilution factor
    expect(result.score).toBe(0.05)
    expect(result.trend).toBe(SentimentTrend.Flat)
  })

  it('reports zero 48h change with only a single article (no older half to compare)', () => {
    const feed = [
      {
        ticker_sentiment: [
          {
            ticker: 'AAPL',
            ticker_sentiment_score: '0.5',
            relevance_score: '1.0',
          },
        ],
      },
    ]
    expect(service.computeSentiment(feed, 'AAPL').change48hPercent).toBe(0)
  })

  it('reports zero 48h change when the older half averaged exactly zero (avoids divide-by-zero)', () => {
    const feed = [
      {
        ticker_sentiment: [
          {
            ticker: 'AAPL',
            ticker_sentiment_score: '0.5',
            relevance_score: '1.0',
          },
        ],
      },
      {
        ticker_sentiment: [
          {
            ticker: 'AAPL',
            ticker_sentiment_score: '0',
            relevance_score: '1.0',
          },
        ],
      },
    ]
    expect(service.computeSentiment(feed, 'AAPL').change48hPercent).toBe(0)
  })
})

describe('computeDecision', () => {
  const base = {
    sentimentScore: 0,
    sentimentTrend: SentimentTrend.Flat,
    analystRating: AnalystRating.Hold,
    newsVolume: 0,
    analystConfidencePercent: 0,
    analystSourceCount: 0,
  }

  it('flags OVERBOUGHT_CONDITION when RSI is 70 or above', () => {
    expect(service.computeDecision({ ...base, rsi: 70 }).riskFlags).toContain(
      'OVERBOUGHT_CONDITION',
    )
  })

  it('flags OVERSOLD_OPPORTUNITY when RSI is 30 or below', () => {
    expect(service.computeDecision({ ...base, rsi: 30 }).riskFlags).toContain(
      'OVERSOLD_OPPORTUNITY',
    )
  })

  it('flags SENTIMENT_DIVERGENCE_WARNING for a StrongBuy rating with falling sentiment', () => {
    const result = service.computeDecision({
      ...base,
      rsi: 50,
      analystRating: AnalystRating.StrongBuy,
      sentimentTrend: SentimentTrend.Down,
    })
    expect(result.riskFlags).toContain('SENTIMENT_DIVERGENCE_WARNING')
  })

  it('flags CONTRA_RECOVERY_DETECTED for a Sell rating with rising sentiment', () => {
    const result = service.computeDecision({
      ...base,
      rsi: 50,
      analystRating: AnalystRating.Sell,
      sentimentTrend: SentimentTrend.Up,
    })
    expect(result.riskFlags).toContain('CONTRA_RECOVERY_DETECTED')
  })

  it('flags STABLE_UPTREND when RSI is mid-range with rising sentiment and no other flags', () => {
    const result = service.computeDecision({
      ...base,
      rsi: 50,
      sentimentTrend: SentimentTrend.Up,
    })
    expect(result.riskFlags).toEqual(['STABLE_UPTREND'])
  })

  it('falls back to NEUTRAL_MARKET_CONDITIONS when nothing else applies', () => {
    const result = service.computeDecision({ ...base, rsi: 50 })
    expect(result.riskFlags).toEqual(['NEUTRAL_MARKET_CONDITIONS'])
  })

  it('recommends Buy when RSI is under 65 with rising sentiment and a bullish rating', () => {
    const result = service.computeDecision({
      ...base,
      rsi: 50,
      sentimentTrend: SentimentTrend.Up,
      analystRating: AnalystRating.Buy,
    })
    expect(result.recommendation).toBe(MarketRecommendation.Buy)
  })

  it('recommends Sell when RSI is 75 or above', () => {
    expect(service.computeDecision({ ...base, rsi: 75 }).recommendation).toBe(
      MarketRecommendation.Sell,
    )
  })

  it('recommends Sell when RSI is over 60 with falling sentiment', () => {
    const result = service.computeDecision({
      ...base,
      rsi: 65,
      sentimentTrend: SentimentTrend.Down,
    })
    expect(result.recommendation).toBe(MarketRecommendation.Sell)
  })

  it('otherwise recommends HoldCaution', () => {
    expect(service.computeDecision({ ...base, rsi: 50 }).recommendation).toBe(
      MarketRecommendation.HoldCaution,
    )
  })

  it('gives a MEDIUM_TERM horizon at high analyst confidence and SHORT_TERM otherwise', () => {
    expect(
      service.computeDecision({
        ...base,
        rsi: 50,
        analystConfidencePercent: 80,
      }).timeHorizon,
    ).toBe('MEDIUM_TERM (1-4 weeks)')
    expect(
      service.computeDecision({
        ...base,
        rsi: 50,
        analystConfidencePercent: 50,
      }).timeHorizon,
    ).toBe('SHORT_TERM (1-5 days)')
  })

  it('clamps confidence into a 0-1 range rounded to 2 decimals', () => {
    const result = service.computeDecision({
      ...base,
      rsi: 50,
      sentimentScore: 1,
      newsVolume: 100,
      analystConfidencePercent: 100,
      analystSourceCount: 100,
    })
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })
})

describe('generateReasoning', () => {
  it('includes an analyst note for a Buy/StrongBuy rating', () => {
    const result = service.generateReasoning({
      rsi: 50,
      sentimentTrend: SentimentTrend.Flat,
      sentimentChange48h: 0,
      analystRating: AnalystRating.StrongBuy,
    })
    expect(result.details.some((d) => d.includes('Analyst consensus'))).toBe(
      true,
    )
  })

  it('notes weakening sentiment on a Down trend and improving sentiment on an Up trend', () => {
    expect(
      service.generateReasoning({
        rsi: 50,
        sentimentTrend: SentimentTrend.Down,
        sentimentChange48h: 0,
        analystRating: AnalystRating.Hold,
      }).details,
    ).toContain('Market sentiment has weakened in the last 48 hours')

    expect(
      service.generateReasoning({
        rsi: 50,
        sentimentTrend: SentimentTrend.Up,
        sentimentChange48h: 0,
        analystRating: AnalystRating.Hold,
      }).details,
    ).toContain('Market sentiment is improving')
  })

  it('flags overbought/oversold RSI conditions', () => {
    expect(
      service.generateReasoning({
        rsi: 70,
        sentimentTrend: SentimentTrend.Flat,
        sentimentChange48h: 0,
        analystRating: AnalystRating.Hold,
      }).details,
    ).toContain('RSI indicates overbought conditions')

    expect(
      service.generateReasoning({
        rsi: 30,
        sentimentTrend: SentimentTrend.Flat,
        sentimentChange48h: 0,
        analystRating: AnalystRating.Hold,
      }).details,
    ).toContain('RSI indicates oversold conditions')
  })

  it('summarizes as elevated risk once 2+ signals line up, mixed otherwise', () => {
    const twoSignals = service.generateReasoning({
      rsi: 70,
      sentimentTrend: SentimentTrend.Down,
      sentimentChange48h: 0,
      analystRating: AnalystRating.Hold,
    })
    expect(twoSignals.summary).toBe(
      'Multiple indicators suggest elevated short-term risk',
    )

    const noSignals = service.generateReasoning({
      rsi: 50,
      sentimentTrend: SentimentTrend.Flat,
      sentimentChange48h: 0,
      analystRating: AnalystRating.Hold,
    })
    expect(noSignals.summary).toBe(
      'Indicators remain mixed with no strong directional bias',
    )
  })
})

describe('computeActionGuidance', () => {
  it('suggests buying on pullbacks when RSI is cool, waiting when RSI is hot', () => {
    expect(
      service.computeActionGuidance(
        MarketRecommendation.Buy,
        50,
        SentimentTrend.Flat,
      ).buyWindow,
    ).toBe('Next 1-3 days on pullbacks')
    expect(
      service.computeActionGuidance(
        MarketRecommendation.Buy,
        65,
        SentimentTrend.Flat,
      ).buyWindow,
    ).toBe('Wait for RSI cooling')
  })

  it('gives a sell window and watch condition for a Sell recommendation', () => {
    const result = service.computeActionGuidance(
      MarketRecommendation.Sell,
      50,
      SentimentTrend.Flat,
    )
    expect(result.sellWindow).toBe('Into strength or momentum loss')
    expect(result.buyWindow).toBeNull()
  })

  it('defaults to a hold window, watching sentiment deterioration or RSI normalization', () => {
    expect(
      service.computeActionGuidance(
        MarketRecommendation.HoldCaution,
        50,
        SentimentTrend.Down,
      ).watchFor,
    ).toBe('Further sentiment deterioration')
    expect(
      service.computeActionGuidance(
        MarketRecommendation.HoldCaution,
        50,
        SentimentTrend.Flat,
      ).watchFor,
    ).toBe('RSI normalization below 65')
  })
})

describe('calculateExposure', () => {
  const position = {
    symbol: 'AAPL',
    quantity: 10,
    currentPrice: 20,
    sector: 'Tech',
  } as any
  const allPositions = [
    position,
    { symbol: 'MSFT', quantity: 5, currentPrice: 10, sector: 'Tech' } as any,
  ]

  it('computes position and sector percentages and flags over-exposure', () => {
    const result = service.calculateExposure(position, 250, allPositions)
    expect(result.positionPercentOfPortfolio).toBe(80)
    expect(result.sectorExposurePercent).toBe(100)
    expect(result.isOverExposed).toBe(true)
  })

  it('does not flag over-exposure for a well-diversified position', () => {
    const smallPosition = {
      symbol: 'AAPL',
      quantity: 1,
      currentPrice: 5,
      sector: 'Tech',
    } as any
    const result = service.calculateExposure(smallPosition, 1000, [
      smallPosition,
    ])
    expect(result.isOverExposed).toBe(false)
  })
})

describe('assessRisk', () => {
  it('rates HIGH/ELEVATED risk with contributors when over-exposed', () => {
    expect(service.assessRisk({ isOverExposed: true })).toEqual({
      riskLevel: 'HIGH',
      volatilityLevel: 'ELEVATED',
      contributors: ['OVEREXPOSED_POSITION', 'SECTOR_CONCENTRATION'],
    })
  })

  it('rates MEDIUM/NORMAL risk with no contributors otherwise', () => {
    expect(service.assessRisk({ isOverExposed: false })).toEqual({
      riskLevel: 'MEDIUM',
      volatilityLevel: 'NORMAL',
      contributors: [],
    })
  })
})

describe('calculateFinalConfidence', () => {
  const base = {
    positionPercent: 10,
    sectorPercent: 20,
    isOverExposed: false,
    unrealizedPnLPercent: 0,
    totalPositions: 5,
  }

  it('penalizes a heavily concentrated position and rewards a small one', () => {
    expect(
      service.calculateFinalConfidence({ ...base, positionPercent: 35 }),
    ).toBeLessThan(service.calculateFinalConfidence(base))
    expect(
      service.calculateFinalConfidence({ ...base, positionPercent: 5 }),
    ).toBeGreaterThan(service.calculateFinalConfidence(base))
  })

  it('penalizes heavy sector concentration', () => {
    expect(
      service.calculateFinalConfidence({ ...base, sectorPercent: 65 }),
    ).toBeLessThan(
      service.calculateFinalConfidence({ ...base, sectorPercent: 45 }),
    )
  })

  it('rewards strong gains and penalizes losses', () => {
    expect(
      service.calculateFinalConfidence({ ...base, unrealizedPnLPercent: 25 }),
    ).toBeGreaterThan(service.calculateFinalConfidence(base))
    expect(
      service.calculateFinalConfidence({ ...base, unrealizedPnLPercent: -25 }),
    ).toBeLessThan(service.calculateFinalConfidence(base))
  })

  it('rewards a well-diversified portfolio and penalizes a thin one', () => {
    expect(
      service.calculateFinalConfidence({ ...base, totalPositions: 10 }),
    ).toBeGreaterThan(service.calculateFinalConfidence(base))
    expect(
      service.calculateFinalConfidence({ ...base, totalPositions: 1 }),
    ).toBeLessThan(service.calculateFinalConfidence(base))
  })

  it('clamps the result between 0.3 and 0.98', () => {
    const worst = service.calculateFinalConfidence({
      positionPercent: 50,
      sectorPercent: 80,
      isOverExposed: true,
      unrealizedPnLPercent: -30,
      totalPositions: 1,
    })
    expect(worst).toBeGreaterThanOrEqual(0.3)

    const best = service.calculateFinalConfidence({
      positionPercent: 1,
      sectorPercent: 1,
      isOverExposed: false,
      unrealizedPnLPercent: 30,
      totalPositions: 20,
    })
    expect(best).toBeLessThanOrEqual(0.98)
  })
})

describe('computePriceTargets', () => {
  it('computes entry/target/stop bands around the current price using the ATR', () => {
    const result = service.computePriceTargets(100, 2)
    expect(result).toEqual({
      entryLow: 99,
      entryHigh: 100.5,
      bullTarget: 104,
      stopLoss: 97,
    })
  })

  it('substitutes a safe default price when the current price is non-positive', () => {
    const result = service.computePriceTargets(0, 2)
    // safePrice falls back to 100
    expect(result.bullTarget).toBe(104)
  })

  it('estimates the ATR as 2% of price when the ATR itself is non-positive', () => {
    const result = service.computePriceTargets(100, 0)
    // effectiveAtr = 100 * 0.02 = 2, same as the explicit-ATR case above
    expect(result.bullTarget).toBe(104)
  })

  it('floors entryLow and stopLoss at 0.01 instead of going negative', () => {
    const result = service.computePriceTargets(1, 10)
    expect(result.entryLow).toBe(0.01)
    expect(result.stopLoss).toBe(0.01)
  })
})

describe('calculatePositionSize', () => {
  it('returns an all-zero result for non-positive capital or price', () => {
    expect(
      service.calculatePositionSize({
        capital: 0,
        currentPrice: 10,
        stopLoss: 8,
        bullTarget: 12,
      }),
    ).toEqual({
      shares: 0,
      riskPerShare: 0,
      totalRisk: 0,
      potentialGain: 0,
      riskRewardRatio: 0,
      percentOfCapital: 0,
    })
  })

  it('computes shares, risk, potential gain and risk/reward ratio', () => {
    const result = service.calculatePositionSize({
      capital: 1000,
      currentPrice: 100,
      stopLoss: 90,
      bullTarget: 120,
    })
    expect(result.shares).toBe(10)
    expect(result.riskPerShare).toBe(10)
    expect(result.totalRisk).toBe(100)
    expect(result.potentialGain).toBe(200)
    expect(result.riskRewardRatio).toBe(2)
  })

  it('reports a zero risk/reward ratio when there is no risk (stop-loss at or above entry)', () => {
    const result = service.calculatePositionSize({
      capital: 1000,
      currentPrice: 100,
      stopLoss: 100,
      bullTarget: 120,
    })
    expect(result.riskRewardRatio).toBe(0)
  })
})

describe('computeAnnualizedReturn', () => {
  it('returns 0 for fewer than 2 closes or a zero starting price', () => {
    expect(service.computeAnnualizedReturn([])).toBe(0)
    expect(service.computeAnnualizedReturn([100])).toBe(0)
    expect(service.computeAnnualizedReturn([0, 100])).toBe(0)
  })

  it('annualizes the return over the given window', () => {
    const result = service.computeAnnualizedReturn([100, 110])
    expect(result).toBeCloseTo((110 / 100 - 1) * (252 / 2), 4)
  })
})

describe('computeAnnualizedVolatility', () => {
  it('returns 0 for fewer than 2 closes', () => {
    expect(service.computeAnnualizedVolatility([100])).toBe(0)
  })

  it('returns 0 when no valid consecutive positive-price pairs exist', () => {
    expect(service.computeAnnualizedVolatility([0, 0, 0])).toBe(0)
  })

  it('computes a positive annualized volatility for a varying price series', () => {
    const closes = [100, 105, 98, 110, 102, 115]
    expect(service.computeAnnualizedVolatility(closes)).toBeGreaterThan(0)
  })
})

describe('computeSharpeRatio', () => {
  it('returns 0 when annualized volatility is 0 (avoids divide-by-zero)', () => {
    expect(service.computeSharpeRatio([100, 100, 100])).toBe(0)
  })

  it('computes and clamps the Sharpe ratio to [-3, 3]', () => {
    const closes = [100, 105, 98, 110, 102, 115, 108, 120]
    const result = service.computeSharpeRatio(closes)
    expect(result).toBeGreaterThanOrEqual(-3)
    expect(result).toBeLessThanOrEqual(3)
  })
})

describe('computePortfolioRiskMetrics', () => {
  it('falls back to a neutral beta and zero Sharpe when the portfolio has no value', () => {
    const result = service.computePortfolioRiskMetrics([], {}, {}, {})
    expect(result.weightedBeta).toBe(1)
    expect(result.portfolioSharpe).toBe(0)
  })

  it('computes a value-weighted beta/Sharpe and sector concentration', () => {
    const positions = [
      { symbol: 'AAPL', quantity: 10, currentPrice: 100, sector: 'Tech' },
      { symbol: 'XOM', quantity: 10, currentPrice: 100, sector: 'Energy' },
    ] as any
    const closesMap = {
      AAPL: [100, 105, 110, 108, 112],
      XOM: [100, 98, 97, 99, 96],
    }
    const betasMap = { AAPL: 1.5, XOM: 0.8 }

    const result = service.computePortfolioRiskMetrics(
      positions,
      {},
      closesMap,
      betasMap,
    )

    expect(result.weightedBeta).toBeCloseTo(1.15, 2)
    expect(result.sectorConcentration).toEqual([
      { sector: 'Tech', weight: 50 },
      { sector: 'Energy', weight: 50 },
    ])
  })
})

// ── enrichPortfolio (mocks the market module boundary only) ────────────────

describe('enrichPortfolio', () => {
  it('computes P&L per position and aggregate summary from live prices', async () => {
    ;(getLivePrices as jest.Mock).mockResolvedValue({ AAPL: 150 })
    ;(getCompanySectors as jest.Mock).mockResolvedValue({ AAPL: 'Technology' })

    const result = await service.enrichPortfolio([
      { symbol: 'aapl', quantity: 10, avg_entry_price: 100 },
    ])

    expect(result.positions[0]).toMatchObject({
      symbol: 'AAPL',
      currentPrice: 150,
      currentValue: 1500,
      unrealizedPnL: 500,
      unrealizedPnLPercent: 50,
      sector: 'Technology',
    })
    expect(result.summary.totalUnrealizedPnLPercent).toBe(50)
  })

  it('reports 0% P&L instead of dividing by zero when cost basis is zero', async () => {
    ;(getLivePrices as jest.Mock).mockResolvedValue({ AAPL: 150 })
    ;(getCompanySectors as jest.Mock).mockResolvedValue({})

    const result = await service.enrichPortfolio([
      { symbol: 'AAPL', quantity: 10, avg_entry_price: 0 },
    ])

    expect(result.positions[0].unrealizedPnLPercent).toBe(0)
    expect(result.summary.totalUnrealizedPnLPercent).toBe(0)
    expect(result.positions[0].sector).toBe('Unknown')
  })
})

// ── Market data orchestration (external clients mocked) ─────────────────────

describe('getQuote', () => {
  it('fetches a quote from Finnhub for the given symbol', async () => {
    mockGet(finnhubClient).mockResolvedValue({ data: { c: 100, pc: 98 } })
    const result = await service.getQuote('AAPL')
    expect(result).toEqual({ c: 100, pc: 98 })
    expect(mockGet(finnhubClient)).toHaveBeenCalledWith('/quote', {
      params: { symbol: 'AAPL' },
    })
  })
})

describe('getMarketStatus', () => {
  it('returns the cached status without calling Finnhub on a cache hit', async () => {
    ;(getCache as jest.Mock).mockResolvedValue('OPEN')
    expect(await service.getMarketStatus()).toBe('OPEN')
    expect(mockGet(finnhubClient)).not.toHaveBeenCalled()
  })

  it('maps an open market to OPEN and caches it', async () => {
    mockGet(finnhubClient).mockResolvedValue({ data: { isOpen: true } })
    expect(await service.getMarketStatus()).toBe('OPEN')
    expect(setCache).toHaveBeenCalledWith(
      'market:status:us',
      'OPEN',
      expect.any(Number),
    )
  })

  it('maps a closed market to CLOSED', async () => {
    mockGet(finnhubClient).mockResolvedValue({ data: { isOpen: false } })
    expect(await service.getMarketStatus()).toBe('CLOSED')
  })
})

describe('getHistoricalCloses', () => {
  it('returns cached closes without calling Yahoo Finance on a cache hit', async () => {
    ;(getCache as jest.Mock).mockResolvedValue([1, 2, 3])
    expect(await service.getHistoricalCloses('AAPL')).toEqual([1, 2, 3])
    expect(yahoo.chart).not.toHaveBeenCalled()
  })

  it('filters out null/undefined closes from the Yahoo Finance chart response', async () => {
    ;(yahoo.chart as jest.Mock).mockResolvedValue({
      quotes: [
        { close: 100 },
        { close: null },
        { close: undefined },
        { close: 110 },
      ],
    })
    const result = await service.getHistoricalCloses('AAPL')
    expect(result).toEqual([100, 110])
    expect(setCache).toHaveBeenCalled()
  })

  it('wraps an empty Yahoo Finance response in a descriptive error', async () => {
    ;(yahoo.chart as jest.Mock).mockResolvedValue({ quotes: [] })
    await expect(service.getHistoricalCloses('AAPL')).rejects.toThrow(
      'Could not fetch time series data from Yahoo Finance',
    )
  })

  it('wraps a Yahoo Finance client error in a descriptive error', async () => {
    ;(yahoo.chart as jest.Mock).mockRejectedValue(new Error('network down'))
    await expect(service.getHistoricalCloses('AAPL')).rejects.toThrow(
      'Could not fetch time series data from Yahoo Finance',
    )
  })
})

describe('getAnalystRatings', () => {
  it('fetches analyst recommendation data from Finnhub', async () => {
    mockGet(finnhubClient).mockResolvedValue({ data: [{ strongBuy: 5 }] })
    expect(await service.getAnalystRatings('AAPL')).toEqual([{ strongBuy: 5 }])
  })
})

describe('getNews', () => {
  it('returns an empty array when Polygon has no results', async () => {
    mockGet(polygonClient).mockResolvedValue({ data: {} })
    expect(await service.getNews('AAPL')).toEqual([])
  })

  it('maps Polygon articles, resolving ticker-specific sentiment when present', async () => {
    mockGet(polygonClient).mockResolvedValue({
      data: {
        results: [
          {
            title: 'AAPL beats earnings',
            article_url: 'https://example.com/a',
            published_utc: '2024-01-01T00:00:00Z',
            description: 'desc',
            image_url: 'https://example.com/img.png',
            publisher: { name: 'Polygon' },
            keywords: ['earnings'],
            insights: [{ ticker: 'AAPL', sentiment: 'positive' }],
          },
        ],
      },
    })

    const [article] = await service.getNews('AAPL')
    expect(article.overall_sentiment_label).toBe('BULLISH')
    expect(article.ticker_sentiment).toEqual([
      {
        ticker: 'AAPL',
        ticker_sentiment_score: '0.75',
        relevance_score: '1.0',
      },
    ])
  })

  it('defaults to neutral sentiment and an empty ticker_sentiment list when there is no matching insight', async () => {
    mockGet(polygonClient).mockResolvedValue({
      data: {
        results: [
          {
            title: 'General market news',
            article_url: 'https://example.com/b',
            published_utc: '2024-01-01T00:00:00Z',
            publisher: {},
          },
        ],
      },
    })

    const [article] = await service.getNews('AAPL')
    expect(article.overall_sentiment_label).toBe('NEUTRAL')
    expect(article.ticker_sentiment).toEqual([])
    expect(article.source).toBe('Polygon')
  })

  it('marks earnings-season articles categorized as EARNINGS as earnings context', async () => {
    ;(getPakistanMonth as jest.Mock).mockReturnValue(3) // an earnings month
    mockGet(polygonClient).mockResolvedValue({
      data: {
        results: [
          {
            title: 'Q1 earnings beat',
            article_url: 'https://example.com/c',
            published_utc: '2024-01-01T00:00:00Z',
            keywords: ['earnings'],
          },
        ],
      },
    })

    const [article] = await service.getNews('AAPL')
    expect(article.isEarningsContext).toBe(true)
  })

  it('returns an empty array and logs when the Polygon request fails', async () => {
    mockGet(polygonClient).mockRejectedValue(new Error('rate limited'))
    expect(await service.getNews('AAPL')).toEqual([])
  })
})

describe('getUnifiedMarketDecision', () => {
  const setupHappyPath = () => {
    mockGet(finnhubClient).mockImplementation((url: string) => {
      if (url === '/quote') return Promise.resolve({ data: { c: 100, pc: 98 } })
      if (url === '/stock/market-status')
        return Promise.resolve({ data: { isOpen: true } })
      if (url === '/stock/recommendation')
        return Promise.resolve({
          data: [{ strongBuy: 8, buy: 1, hold: 1, sell: 0, strongSell: 0 }],
        })
      return Promise.resolve({ data: {} })
    })
    ;(yahoo.chart as jest.Mock).mockResolvedValue({
      quotes: Array.from({ length: 30 }, (_, i) => ({ close: 100 + i })),
    })
    mockGet(polygonClient).mockResolvedValue({ data: {} })
  }

  it('returns the cached decision without recomputing on a cache hit', async () => {
    ;(getCache as jest.Mock).mockResolvedValue({ symbol: 'AAPL', cached: true })
    const result = await service.getUnifiedMarketDecision('AAPL')
    expect(result).toEqual({ symbol: 'AAPL', cached: true })
    expect(mockGet(finnhubClient)).not.toHaveBeenCalled()
  })

  it('composes quote, technicals, analyst consensus and sentiment into one decision, and caches it', async () => {
    setupHappyPath()
    const result = await service.getUnifiedMarketDecision('AAPL')

    expect(result.symbol).toBe('AAPL')
    expect(result.marketStatus).toBe('OPEN')
    expect(result.analyst.rating).toBe(AnalystRating.StrongBuy)
    expect(result.decision.recommendation).toBeDefined()
    expect(setCache).toHaveBeenCalledWith(
      'market_decision_v1:AAPL',
      expect.any(Object),
      expect.any(Number),
    )
  })
})

describe('getMarketDecisionResponse', () => {
  it('assembles the full trade-decision response including ATR-based price targets', async () => {
    mockGet(finnhubClient).mockImplementation((url: string) => {
      if (url === '/quote') return Promise.resolve({ data: { c: 100, pc: 98 } })
      if (url === '/stock/market-status')
        return Promise.resolve({ data: { isOpen: true } })
      if (url === '/stock/recommendation') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: {} })
    })
    ;(yahoo.chart as jest.Mock).mockResolvedValue({
      quotes: Array.from({ length: 30 }, (_, i) => ({ close: 100 + i })),
    })
    mockGet(polygonClient).mockResolvedValue({ data: {} })
    mockGet(twelveDataClient).mockResolvedValue({
      data: { values: [{ atr: '2.5' }] },
    })

    const result = await service.getMarketDecisionResponse('AAPL')

    expect(result.symbol).toBe('AAPL')
    expect(result.priceState.current).toBe(100)
    expect(result.priceTargets.bullTarget).toBeGreaterThan(100)
    expect(result.atr).toBe(2.5)
  })

  it('falls back to the previous close when the live quote has no current price', async () => {
    mockGet(finnhubClient).mockImplementation((url: string) => {
      if (url === '/quote') return Promise.resolve({ data: { c: 0, pc: 95 } })
      if (url === '/stock/market-status')
        return Promise.resolve({ data: { isOpen: false } })
      if (url === '/stock/recommendation') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: {} })
    })
    ;(yahoo.chart as jest.Mock).mockResolvedValue({
      quotes: Array.from({ length: 30 }, (_, i) => ({ close: 100 + i })),
    })
    mockGet(polygonClient).mockResolvedValue({ data: {} })
    mockGet(twelveDataClient).mockRejectedValue(new Error('twelve data down'))

    const result = await service.getMarketDecisionResponse('AAPL')
    expect(result.priceState.current).toBe(95)
  })
})

describe('getATR', () => {
  it('returns the cached ATR without calling Twelve Data on a cache hit', async () => {
    ;(getCache as jest.Mock).mockResolvedValue(3.2)
    expect(await service.getATR('AAPL')).toBe(3.2)
    expect(mockGet(twelveDataClient)).not.toHaveBeenCalled()
  })

  it('returns and caches the Twelve Data ATR on success', async () => {
    mockGet(twelveDataClient).mockResolvedValue({
      data: { values: [{ atr: '4.5' }] },
    })
    expect(await service.getATR('AAPL')).toBe(4.5)
    expect(setCache).toHaveBeenCalledWith(
      'atr_v1:AAPL',
      4.5,
      expect.any(Number),
    )
  })

  it('estimates the ATR from historical closes when Twelve Data fails', async () => {
    mockGet(twelveDataClient).mockRejectedValue(new Error('twelve data down'))
    ;(yahoo.chart as jest.Mock).mockResolvedValue({
      quotes: Array.from({ length: 20 }, (_, i) => ({
        close: 100 + (i % 2 === 0 ? 1 : -1),
      })),
    })
    const result = await service.getATR('AAPL')
    expect(result).toBeGreaterThan(0)
  })

  it('falls back to a fixed constant when both Twelve Data and the closes-based estimate fail', async () => {
    mockGet(twelveDataClient).mockRejectedValue(new Error('twelve data down'))
    ;(yahoo.chart as jest.Mock).mockRejectedValue(new Error('yahoo down'))
    expect(await service.getATR('AAPL')).toBe(2.5)
  })
})

// ── Portfolio persistence orchestration (Prisma + market mocked) ────────────

describe('getPortfolioSnapshot', () => {
  it('throws when the portfolio does not exist', async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue(null)
    await expect(service.getPortfolioSnapshot('missing-id')).rejects.toThrow(
      'Portfolio not found',
    )
  })

  it('enriches each position with live price/sector and computes portfolio summary', async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue({
      id: 'portfolio-1',
      positions: [{ symbol: 'AAPL', quantity: 10, avgEntryPrice: 100 }],
    })
    ;(getLivePrices as jest.Mock).mockResolvedValue({ AAPL: 150 })
    ;(getCompanySectors as jest.Mock).mockResolvedValue({ AAPL: 'Technology' })

    const result = await service.getPortfolioSnapshot('portfolio-1')

    expect(result.summary.totalMarketValue).toBe(1500)
    expect(result.summary.totalUnrealizedPnLPercent).toBe(50)
    expect(result.positions[0].sector).toBe('Technology')
  })

  it('reports 0% unrealized P&L instead of dividing by zero when entry price is zero', async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue({
      id: 'portfolio-1',
      positions: [{ symbol: 'AAPL', quantity: 10, avgEntryPrice: 0 }],
    })
    ;(getLivePrices as jest.Mock).mockResolvedValue({ AAPL: 150 })
    ;(getCompanySectors as jest.Mock).mockResolvedValue({})

    const result = await service.getPortfolioSnapshot('portfolio-1')
    expect(result.positions[0].unrealizedPnLPercent).toBe(0)
  })
})

describe('getLatestPortfolioForUser', () => {
  it('returns null when the user has no portfolio', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(null)
    expect(await service.getLatestPortfolioForUser('user-1')).toBeNull()
  })

  it("returns the snapshot for the user's most recent portfolio", async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'portfolio-1' })
    mockPrisma.portfolio.findUnique.mockResolvedValue({
      id: 'portfolio-1',
      positions: [],
    })
    ;(getLivePrices as jest.Mock).mockResolvedValue({})
    ;(getCompanySectors as jest.Mock).mockResolvedValue({})

    const result = await service.getLatestPortfolioForUser('user-1')
    expect(result?.portfolioId).toBe('portfolio-1')
  })
})

describe('removePortfoliosForUser', () => {
  it('deletes all portfolios for the user and returns the count removed', async () => {
    mockPrisma.portfolio.deleteMany.mockResolvedValue({ count: 3 })
    expect(await service.removePortfoliosForUser('user-1')).toBe(3)
    expect(mockPrisma.portfolio.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
  })
})

describe('uploadPortfolio', () => {
  beforeEach(() => {
    ;(getLivePrices as jest.Mock).mockResolvedValue({ AAPL: 150 })
    ;(getCompanySectors as jest.Mock).mockResolvedValue({ AAPL: 'Technology' })
    mockPrisma.portfolio.create.mockResolvedValue({ id: 'portfolio-1' })
    mockPrisma.position.createMany.mockResolvedValue({ count: 1 })
  })

  it('rejects when the file type or buffer is missing', async () => {
    await expect(
      service.uploadPortfolio(undefined, undefined, 'user-1'),
    ).rejects.toThrow('File is required')
  })

  it('parses a CSV upload, enriches it, and persists the portfolio and positions', async () => {
    const csv = 'symbol,quantity,avg_entry_price\nAAPL,10,100\n'
    const result = await service.uploadPortfolio(
      'text/csv',
      Buffer.from(csv),
      'user-1',
    )

    expect(result.portfolioId).toBe('portfolio-1')
    expect(result.summary.totalPositions).toBe(1)
    expect(mockPrisma.position.createMany).toHaveBeenCalledWith({
      data: [
        {
          portfolioId: 'portfolio-1',
          symbol: 'AAPL',
          quantity: 10,
          avgEntryPrice: 100,
          sector: 'Technology',
        },
      ],
    })
  })

  it('does not coerce a numeric-looking symbol (e.g. a ticker like "0700") into a number', async () => {
    ;(getLivePrices as jest.Mock).mockResolvedValue({ '0700': 50 })
    ;(getCompanySectors as jest.Mock).mockResolvedValue({
      '0700': 'Technology',
    })
    const csv = 'symbol,quantity,avg_entry_price\n0700,10,100\n'

    await service.uploadPortfolio('text/csv', Buffer.from(csv), 'user-1')

    expect(mockPrisma.position.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ symbol: '0700' })],
    })
  })

  it('still rejects a CSV row whose quantity is not a valid number', async () => {
    const csv = 'symbol,quantity,avg_entry_price\nAAPL,not-a-number,100\n'

    await expect(
      service.uploadPortfolio('text/csv', Buffer.from(csv), 'user-1'),
    ).rejects.toThrow()
  })

  it('parses an XLSX upload the same way', async () => {
    const worksheet = xlsx.utils.json_to_sheet([
      { symbol: 'AAPL', quantity: 10, avg_entry_price: 100 },
    ])
    const workbook = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    const result = await service.uploadPortfolio(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
      'user-1',
    )

    expect(result.summary.totalPositions).toBe(1)
  })

  it('rejects rows that fail portfolio row validation', async () => {
    const csv = 'symbol,quantity,avg_entry_price\n,10,100\n'
    await expect(
      service.uploadPortfolio('text/csv', Buffer.from(csv), 'user-1'),
    ).rejects.toThrow()
  })
})

// ── Batch decisions & opportunity radar (heaviest orchestration paths) ──────

describe('generateBatchDecision / getPortfolioDecisionResponse', () => {
  beforeEach(() => {
    mockPrisma.portfolio.findUnique.mockResolvedValue({
      id: 'portfolio-1',
      positions: [{ symbol: 'AAPL', quantity: 10, avgEntryPrice: 100 }],
    })
    ;(getLivePrices as jest.Mock).mockResolvedValue({ AAPL: 150 })
    ;(getCompanySectors as jest.Mock).mockResolvedValue({ AAPL: 'Technology' })

    mockGet(finnhubClient).mockImplementation((url: string) => {
      if (url === '/quote')
        return Promise.resolve({ data: { c: 150, pc: 148 } })
      if (url === '/stock/market-status')
        return Promise.resolve({ data: { isOpen: true } })
      if (url === '/stock/recommendation') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: {} })
    })
    ;(yahoo.chart as jest.Mock).mockResolvedValue({
      quotes: Array.from({ length: 30 }, (_, i) => ({ close: 100 + i })),
    })
    mockGet(polygonClient).mockResolvedValue({ data: {} })
  })

  it('produces one decision per position, with exposure/risk/action guidance attached', async () => {
    const results = await service.generateBatchDecision('portfolio-1')

    expect(results).toHaveLength(1)
    expect(results[0].symbol).toBe('AAPL')
    expect(results[0].exposure.positionPercent).toBe(100)
    expect(results[0].riskLevel).toBe('HIGH')
    expect(results[0].actionGuidance).toBeDefined()
  })

  it('recommends Exit for a position down more than 20%, regardless of exposure', async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue({
      id: 'portfolio-1',
      positions: [{ symbol: 'AAPL', quantity: 10, avgEntryPrice: 200 }],
    })
    ;(getLivePrices as jest.Mock).mockResolvedValue({ AAPL: 150 })

    const results = await service.generateBatchDecision('portfolio-1')

    expect(results[0].portfolioDecision).toBe('EXIT')
    expect(results[0].reasoning.details).toContain(
      'Significant unrealized loss',
    )
    expect(results[0].reasoning.summary).toContain('Critical risk detected')
  })

  it('recommends Hold for a position that is only over-exposed via sector concentration, not its own size', async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue({
      id: 'portfolio-1',
      positions: [
        { symbol: 'AAPL', quantity: 10, avgEntryPrice: 100 },
        { symbol: 'MSFT', quantity: 25, avgEntryPrice: 100 },
        { symbol: 'GOOGL', quantity: 35, avgEntryPrice: 100 },
      ],
    })
    ;(getLivePrices as jest.Mock).mockResolvedValue({
      AAPL: 100,
      MSFT: 100,
      GOOGL: 100,
    })
    ;(getCompanySectors as jest.Mock).mockResolvedValue({
      AAPL: 'Technology',
      MSFT: 'Technology',
      GOOGL: 'Consumer',
    })
    // Flat/oscillating closes (RSI ~50) keep the market decision at
    // HoldCaution rather than Sell — otherwise the Exit branch's
    // `marketDecision === Sell && isOverExposed` would fire first and mask
    // the Hold-via-sector-only branch this test targets.
    ;(yahoo.chart as jest.Mock).mockResolvedValue({
      quotes: Array.from({ length: 30 }, (_, i) => ({
        close: 100 + (i % 2),
      })),
    })

    const results = await service.generateBatchDecision('portfolio-1')
    const aapl = results.find((r) => r.symbol === 'AAPL')!

    expect(aapl.exposure.positionPercent).toBeLessThanOrEqual(15)
    expect(aapl.exposure.sectorPercent).toBeGreaterThan(40)
    expect(aapl.portfolioDecision).toBe('HOLD')
    expect(aapl.reasoning.summary).toContain('internal portfolio risk')
    expect(aapl.reasoning.details).toContain('High sector concentration')
  })

  it('produces action guidance for a diversified, non-overexposed position (lower risk profile)', async () => {
    const sectors = [
      'Technology',
      'Finance',
      'Energy',
      'Healthcare',
      'Consumer',
      'Industrial',
      'Utilities',
      'RealEstate',
    ]
    const symbols = ['AAPL', 'JPM', 'XOM', 'PFE', 'PG', 'CAT', 'DUK', 'PLD']
    mockPrisma.portfolio.findUnique.mockResolvedValue({
      id: 'portfolio-1',
      positions: symbols.map((symbol) => ({
        symbol,
        quantity: 10,
        avgEntryPrice: 150,
      })),
    })
    ;(getLivePrices as jest.Mock).mockResolvedValue(
      Object.fromEntries(symbols.map((s) => [s, 150])),
    )
    ;(getCompanySectors as jest.Mock).mockResolvedValue(
      Object.fromEntries(symbols.map((s, i) => [s, sectors[i]])),
    )

    const results = await service.generateBatchDecision('portfolio-1')
    const aapl = results.find((r) => r.symbol === 'AAPL')!

    expect(aapl.exposure.isOverExposed).toBe(false)
    expect(aapl.riskLevel).toBe('MEDIUM')
    expect(aapl.actionGuidance.positionStrategy).toMatchObject({
      add: true,
      trim: false,
    })
  })

  it('trims to summary fields in OVERVIEW mode and returns full results in DETAILED mode', async () => {
    const overview = await service.getPortfolioDecisionResponse(
      'user-1',
      'portfolio-1',
      'OVERVIEW',
    )
    expect(Object.keys(overview.positions[0]).sort()).toEqual(
      [
        'confidence',
        'marketDecision',
        'portfolioDecision',
        'riskLevel',
        'sector',
        'symbol',
      ].sort(),
    )

    const detailed = await service.getPortfolioDecisionResponse(
      'user-1',
      'portfolio-1',
      'DETAILED',
    )
    expect(detailed.positions[0]).toHaveProperty('reasoning')
  })

  it('still resolves successfully even if persisting the decision run fails in the background', async () => {
    ;(persistDecisionRun as jest.Mock).mockRejectedValue(new Error('db down'))

    await expect(
      service.getPortfolioDecisionResponse('user-1', 'portfolio-1', 'OVERVIEW'),
    ).resolves.toBeDefined()
  })
})

describe('fetchPortfolioBetas', () => {
  it('returns an empty object for an empty symbol list', async () => {
    expect(await service.fetchPortfolioBetas([])).toEqual({})
  })

  it('returns the cached betas without calling FMP on a cache hit', async () => {
    ;(getCache as jest.Mock).mockResolvedValue({ AAPL: 1.2 })
    expect(await service.fetchPortfolioBetas(['AAPL'])).toEqual({ AAPL: 1.2 })
    expect(mockGet(fmpClient)).not.toHaveBeenCalled()
  })

  it('fetches betas from FMP and falls back to 1.0 for symbols missing a beta', async () => {
    mockGet(fmpClient).mockResolvedValue({
      data: [{ symbol: 'AAPL', beta: 1.3 }],
    })
    const result = await service.fetchPortfolioBetas(['AAPL', 'MSFT'])
    expect(result).toEqual({ AAPL: 1.3, MSFT: 1.0 })
  })

  it('falls back to 1.0 for every symbol when the FMP call fails', async () => {
    mockGet(fmpClient).mockRejectedValue(new Error('fmp down'))
    expect(await service.fetchPortfolioBetas(['AAPL'])).toEqual({ AAPL: 1.0 })
  })
})

describe('getPortfolioRiskMetrics', () => {
  it('assembles risk metrics from the portfolio snapshot, betas and historical closes', async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue({
      id: 'portfolio-1',
      positions: [{ symbol: 'AAPL', quantity: 10, avgEntryPrice: 100 }],
    })
    ;(getLivePrices as jest.Mock).mockResolvedValue({ AAPL: 150 })
    ;(getCompanySectors as jest.Mock).mockResolvedValue({ AAPL: 'Technology' })
    mockGet(fmpClient).mockResolvedValue({
      data: [{ symbol: 'AAPL', beta: 1.1 }],
    })
    ;(yahoo.chart as jest.Mock).mockResolvedValue({
      quotes: Array.from({ length: 20 }, (_, i) => ({ close: 100 + i })),
    })

    const result = await service.getPortfolioRiskMetrics('portfolio-1')
    expect(result.perSymbol[0].beta).toBe(1.1)
  })

  it('treats a symbol whose historical closes fail to load as having no closes, rather than failing the whole request', async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue({
      id: 'portfolio-1',
      positions: [{ symbol: 'AAPL', quantity: 10, avgEntryPrice: 100 }],
    })
    ;(getLivePrices as jest.Mock).mockResolvedValue({ AAPL: 150 })
    ;(getCompanySectors as jest.Mock).mockResolvedValue({ AAPL: 'Technology' })
    mockGet(fmpClient).mockResolvedValue({ data: [] })
    ;(yahoo.chart as jest.Mock).mockRejectedValue(new Error('yahoo down'))

    const result = await service.getPortfolioRiskMetrics('portfolio-1')
    expect(result.perSymbol[0].volatilityAnnualized).toBe(0)
  })
})

describe('getOpportunityRadar', () => {
  it('returns the cached radar without calling FMP on a cache hit', async () => {
    ;(getCache as jest.Mock).mockResolvedValue([{ symbol: 'AAPL' }])
    expect(await service.getOpportunityRadar('1D')).toEqual([
      { symbol: 'AAPL' },
    ])
    expect(mockGet(fmpClient)).not.toHaveBeenCalled()
  })

  it('falls back to the static SPUS universe when the FMP screener call fails', async () => {
    mockGet(fmpClient).mockRejectedValue(new Error('fmp down'))
    mockGet(finnhubClient).mockResolvedValue({ data: {} })
    ;(yahoo.chart as jest.Mock).mockResolvedValue({ quotes: [] })
    mockGet(twelveDataClient).mockResolvedValue({ data: {} })
    mockGet(polygonClient).mockResolvedValue({ data: {} })

    const result = await service.getOpportunityRadar('1D')
    // every candidate has currentPrice 0 (no quote data mocked) and is skipped
    expect(result).toEqual([])
  })

  it('builds radar cards from screener candidates, sorted by confidence, skipping zero-price candidates', async () => {
    mockGet(fmpClient).mockImplementation((url: string) => {
      if (url === '/company-screener') {
        return Promise.resolve({
          data: Array.from({ length: 15 }, (_, i) => ({
            symbol: `SYM${i}`,
            sector: 'Technology',
            marketCap: 25_000_000_000,
          })),
        })
      }
      if (url.startsWith('/quote/')) {
        return Promise.resolve({
          data: [{ symbol: 'SYM0', price: 42 }],
        })
      }
      return Promise.resolve({ data: {} })
    })
    mockGet(finnhubClient).mockImplementation((url: string) => {
      if (url === '/quote') return Promise.resolve({ data: { c: 0, pc: 0 } })
      if (url === '/stock/market-status')
        return Promise.resolve({ data: { isOpen: true } })
      if (url === '/stock/recommendation') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: {} })
    })
    ;(yahoo.chart as jest.Mock).mockResolvedValue({
      quotes: Array.from({ length: 30 }, (_, i) => ({ close: 100 + i })),
    })
    mockGet(polygonClient).mockResolvedValue({ data: {} })
    mockGet(twelveDataClient).mockResolvedValue({
      data: { values: [{ atr: '1.5' }] },
    })

    const result = await service.getOpportunityRadar('1D')

    // Only SYM0 gets a non-zero price via the batch-quote fallback; the rest
    // have currentPrice 0 (no per-symbol quote data) and are filtered out.
    expect(result).toHaveLength(1)
    expect(result[0].symbol).toBe('SYM0')
    expect(setCache).toHaveBeenCalled()
  })
})
