/**
 * Unit tests for the pure computation engine in decision-support/service.
 *
 * Strategy (High-Value Targeting + Black-Box Design):
 * - Only exported, pure functions are tested here. No DB, no network.
 * - We assert on returned values/shapes, not on internal function calls.
 * - Refactoring internals must NEVER require editing these tests as long
 *   as the public contract (input → output shape) is unchanged.
 */
import {
  assessRisk,
  calculateExposure,
  calculateFinalConfidence,
  computeActionGuidance,
  computeDecision,
  computeSentiment,
  computeTrend,
  generateReasoning,
  parseAnalystConsensus,
} from '../../modules/decision-support/service'

// ──────────────────────────────────────────────────────────────────────────────
// computeTrend
// ──────────────────────────────────────────────────────────────────────────────

describe('computeTrend', () => {
  const makePrices = (short: number, long: number): number[] => {
    // Fill 20 long-period values, then replace last 5 with short-period values
    const arr = Array(20).fill(long)
    for (let i = 15; i < 20; i++) arr[i] = short
    return arr
  }

  it('returns "UP" when the 5-day average is above the 20-day average', () => {
    const closes = makePrices(110, 100)
    expect(computeTrend(closes)).toBe('UP')
  })

  it('returns "DOWN" when the 5-day average is below the 20-day average', () => {
    const closes = makePrices(90, 100)
    expect(computeTrend(closes)).toBe('DOWN')
  })

  it('returns "FLAT" when both averages are equal', () => {
    const closes = Array(20).fill(100)
    expect(computeTrend(closes)).toBe('FLAT')
  })

  it('works correctly with fewer than 20 prices (uses what is available)', () => {
    // 5-item array: short and long windows will overlap, but must not throw
    const closes = [95, 98, 102, 101, 105]
    const result = computeTrend(closes)
    expect(['UP', 'DOWN', 'FLAT']).toContain(result)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// parseAnalystConsensus
// ──────────────────────────────────────────────────────────────────────────────

describe('parseAnalystConsensus', () => {
  it('returns HOLD with 0 confidence for empty data', () => {
    expect(parseAnalystConsensus([])).toEqual({
      rating: 'HOLD',
      confidencePercent: 0,
      sourceCount: 0,
    })
  })

  it('returns STRONG_BUY when ≥80% of analysts are bullish', () => {
    const data = [{ strongBuy: 40, buy: 40, hold: 10, sell: 5, strongSell: 5 }]
    const result = parseAnalystConsensus(data)
    expect(result.rating).toBe('STRONG_BUY')
    expect(result.confidencePercent).toBe(80)
    expect(result.sourceCount).toBe(100)
  })

  it('returns BUY for 60–79% bullish consensus', () => {
    const data = [{ strongBuy: 30, buy: 35, hold: 20, sell: 10, strongSell: 5 }]
    const result = parseAnalystConsensus(data)
    expect(result.rating).toBe('BUY')
    expect(result.confidencePercent).toBe(65)
  })

  it('returns HOLD for 40–59% bullish consensus', () => {
    const data = [{ strongBuy: 20, buy: 30, hold: 30, sell: 10, strongSell: 10 }]
    const result = parseAnalystConsensus(data)
    expect(result.rating).toBe('HOLD')
    expect(result.confidencePercent).toBe(50)
  })

  it('returns SELL for 20–39% bullish consensus', () => {
    const data = [{ strongBuy: 5, buy: 25, hold: 30, sell: 20, strongSell: 20 }]
    const result = parseAnalystConsensus(data)
    expect(result.rating).toBe('SELL')
    expect(result.confidencePercent).toBe(30)
  })

  it('returns STRONG_SELL for <20% bullish consensus', () => {
    const data = [{ strongBuy: 2, buy: 8, hold: 20, sell: 30, strongSell: 40 }]
    const result = parseAnalystConsensus(data)
    expect(result.rating).toBe('STRONG_SELL')
    expect(result.confidencePercent).toBe(10)
  })

  it('handles all-zero analysts gracefully (confidence stays 0)', () => {
    const data = [{ strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 }]
    const result = parseAnalystConsensus(data)
    expect(result.confidencePercent).toBe(0)
    expect(result.sourceCount).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// computeSentiment
// ──────────────────────────────────────────────────────────────────────────────

describe('computeSentiment', () => {
  it('returns zero/flat result for an empty news feed', () => {
    expect(computeSentiment([], 'AAPL')).toEqual({
      score: 0,
      trend: 'FLAT',
      change48hPercent: 0,
      newsVolume: 0,
    })
  })

  const makeArticle = (tickerScore: number) => ({
    ticker_sentiment: [
      {
        ticker: 'AAPL',
        ticker_sentiment_score: String(tickerScore),
        relevance_score: '1.0',
      },
    ],
    overall_sentiment_score: tickerScore,
  })

  it('returns trend "UP" when average weighted score ≥ 0.15', () => {
    const feed = Array(10).fill(null).map(() => makeArticle(0.3))
    const result = computeSentiment(feed, 'AAPL')
    expect(result.trend).toBe('UP')
    expect(result.score).toBeGreaterThan(0)
    expect(result.newsVolume).toBe(10)
  })

  it('returns trend "DOWN" when average weighted score ≤ −0.15', () => {
    const feed = Array(10).fill(null).map(() => makeArticle(-0.3))
    const result = computeSentiment(feed, 'AAPL')
    expect(result.trend).toBe('DOWN')
    expect(result.score).toBeLessThan(0)
  })

  it('returns trend "FLAT" when score is between −0.15 and 0.15', () => {
    const feed = Array(10).fill(null).map(() => makeArticle(0.05))
    const result = computeSentiment(feed, 'AAPL')
    expect(result.trend).toBe('FLAT')
  })

  it('falls back to overall_sentiment_score × 0.1 when ticker is missing', () => {
    // Articles without matching ticker sentiment
    const feed = [
      { ticker_sentiment: [], overall_sentiment_score: 1.0 },
      { ticker_sentiment: [], overall_sentiment_score: 1.0 },
    ]
    const result = computeSentiment(feed, 'AAPL')
    // Each article contributes 1.0 * 0.1 = 0.1, avg = 0.1 → FLAT
    expect(result.trend).toBe('FLAT')
    expect(result.score).toBeCloseTo(0.1, 3)
  })

  it('newsVolume reflects the feed length', () => {
    const feed = Array(7).fill(null).map(() => makeArticle(0.2))
    const result = computeSentiment(feed, 'AAPL')
    expect(result.newsVolume).toBe(7)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// computeDecision
// ──────────────────────────────────────────────────────────────────────────────

describe('computeDecision', () => {
  const baseInput = {
    rsi: 50,
    sentimentTrend: 'FLAT' as const,
    analystRating: 'HOLD',
    sentimentScore: 0,
    newsVolume: 5,
    analystConfidencePercent: 50,
    analystSourceCount: 10,
  }

  it('recommends BUY when RSI < 65, sentiment UP, analyst is BUY/STRONG_BUY', () => {
    const result = computeDecision({
      ...baseInput,
      rsi: 55,
      sentimentTrend: 'UP',
      analystRating: 'BUY',
    })
    expect(result.recommendation).toBe('BUY')
  })

  it('recommends SELL when RSI ≥ 75', () => {
    const result = computeDecision({ ...baseInput, rsi: 80 })
    expect(result.recommendation).toBe('SELL')
  })

  it('recommends SELL when RSI > 60 and sentiment is DOWN', () => {
    const result = computeDecision({
      ...baseInput,
      rsi: 62,
      sentimentTrend: 'DOWN',
    })
    expect(result.recommendation).toBe('SELL')
  })

  it('defaults to HOLD / CAUTION for neutral conditions', () => {
    const result = computeDecision(baseInput)
    expect(result.recommendation).toBe('HOLD / CAUTION')
  })

  it('adds OVERBOUGHT_CONDITION risk flag when RSI ≥ 70', () => {
    const result = computeDecision({ ...baseInput, rsi: 72 })
    expect(result.riskFlags).toContain('OVERBOUGHT_CONDITION')
  })

  it('adds OVERSOLD_OPPORTUNITY risk flag when RSI ≤ 30', () => {
    const result = computeDecision({ ...baseInput, rsi: 28 })
    expect(result.riskFlags).toContain('OVERSOLD_OPPORTUNITY')
  })

  it('adds SENTIMENT_DIVERGENCE_WARNING when analyst is STRONG_BUY but sentiment is DOWN', () => {
    const result = computeDecision({
      ...baseInput,
      analystRating: 'STRONG_BUY',
      sentimentTrend: 'DOWN',
    })
    expect(result.riskFlags).toContain('SENTIMENT_DIVERGENCE_WARNING')
  })

  it('adds CONTRA_RECOVERY_DETECTED when analyst is SELL but sentiment is UP', () => {
    const result = computeDecision({
      ...baseInput,
      analystRating: 'SELL',
      sentimentTrend: 'UP',
    })
    expect(result.riskFlags).toContain('CONTRA_RECOVERY_DETECTED')
  })

  it('assigns MEDIUM_TERM time horizon when analystConfidencePercent ≥ 70', () => {
    const result = computeDecision({
      ...baseInput,
      analystConfidencePercent: 75,
    })
    expect(result.timeHorizon).toContain('MEDIUM_TERM')
  })

  it('returns confidence as a number in [0, 1]', () => {
    const result = computeDecision(baseInput)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('riskFlags always has at least one entry', () => {
    const result = computeDecision(baseInput)
    expect(result.riskFlags.length).toBeGreaterThan(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// generateReasoning
// ──────────────────────────────────────────────────────────────────────────────

describe('generateReasoning', () => {
  it('returns an object with summary string and details array', () => {
    const result = generateReasoning({
      rsi: 50,
      sentimentTrend: 'FLAT',
      sentimentChange48h: 0,
      analystRating: 'HOLD',
    })
    expect(typeof result.summary).toBe('string')
    expect(Array.isArray(result.details)).toBe(true)
  })

  it('includes analyst note for STRONG_BUY rating', () => {
    const { details } = generateReasoning({
      rsi: 50,
      sentimentTrend: 'FLAT',
      sentimentChange48h: 0,
      analystRating: 'STRONG_BUY',
    })
    expect(details.some((d) => d.toLowerCase().includes('strong buy'))).toBe(true)
  })

  it('includes sentiment warning for DOWN trend', () => {
    const { details } = generateReasoning({
      rsi: 50,
      sentimentTrend: 'DOWN',
      sentimentChange48h: -20,
      analystRating: 'HOLD',
    })
    expect(details.some((d) => d.toLowerCase().includes('sentiment'))).toBe(true)
  })

  it('includes overbought warning when RSI ≥ 70', () => {
    const { details } = generateReasoning({
      rsi: 75,
      sentimentTrend: 'FLAT',
      sentimentChange48h: 0,
      analystRating: 'HOLD',
    })
    expect(details.some((d) => d.toLowerCase().includes('overbought'))).toBe(true)
  })

  it('includes oversold note when RSI ≤ 30', () => {
    const { details } = generateReasoning({
      rsi: 25,
      sentimentTrend: 'FLAT',
      sentimentChange48h: 0,
      analystRating: 'HOLD',
    })
    expect(details.some((d) => d.toLowerCase().includes('oversold'))).toBe(true)
  })

  it('uses "elevated short-term risk" summary when ≥2 details are present', () => {
    // RSI overbought (70+) AND sentiment DOWN → 2 details
    const { summary } = generateReasoning({
      rsi: 75,
      sentimentTrend: 'DOWN',
      sentimentChange48h: -30,
      analystRating: 'HOLD',
    })
    expect(summary).toMatch(/elevated.*risk/i)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// computeActionGuidance
// ──────────────────────────────────────────────────────────────────────────────

describe('computeActionGuidance', () => {
  it('sets buyWindow for BUY recommendation (RSI < 60)', () => {
    const result = computeActionGuidance('BUY', 55, 'UP')
    expect(result.buyWindow).toContain('1-3 days')
    expect(result.holdWindow).toBeNull()
    expect(result.sellWindow).toBeNull()
  })

  it('returns "Wait for RSI cooling" as buyWindow for BUY when RSI ≥ 60', () => {
    const result = computeActionGuidance('BUY', 62, 'UP')
    expect(result.buyWindow).toContain('RSI')
  })

  it('sets sellWindow for SELL recommendation', () => {
    const result = computeActionGuidance('SELL', 78, 'DOWN')
    expect(result.sellWindow).toBeTruthy()
    expect(result.buyWindow).toBeNull()
    expect(result.holdWindow).toBeNull()
  })

  it('sets holdWindow for HOLD / CAUTION recommendation', () => {
    const result = computeActionGuidance('HOLD / CAUTION', 50, 'FLAT')
    expect(result.holdWindow).toBeTruthy()
    expect(result.buyWindow).toBeNull()
    expect(result.sellWindow).toBeNull()
  })

  it('watchFor changes based on sentiment for HOLD', () => {
    const downResult = computeActionGuidance('HOLD / CAUTION', 50, 'DOWN')
    expect(downResult.watchFor).toMatch(/deterioration/i)

    const flatResult = computeActionGuidance('HOLD / CAUTION', 50, 'FLAT')
    expect(flatResult.watchFor).toMatch(/RSI/i)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// calculateExposure
// ──────────────────────────────────────────────────────────────────────────────

describe('calculateExposure', () => {
  /** Minimal position shape — calculateExposure only needs symbol, quantity, currentPrice, sector */
  const makePosition = (
    symbol: string,
    qty: number,
    price: number,
    sector: string,
  ) => ({
    symbol,
    quantity: qty,
    currentPrice: price,
    avgEntryPrice: price,
    sector,
  })

  it('calculates positionPercentOfPortfolio correctly', () => {
    const pos = makePosition('AAPL', 10, 100, 'Tech')
    const all = [pos, makePosition('MSFT', 10, 100, 'Tech')]
    const result = calculateExposure(pos, 2000, all)
    // AAPL = 1000 / 2000 = 50%
    expect(result.positionPercentOfPortfolio).toBe(50)
  })

  it('calculates sectorExposurePercent by aggregating same-sector positions', () => {
    const aapl = makePosition('AAPL', 10, 100, 'Tech')
    const msft = makePosition('MSFT', 10, 100, 'Tech')
    const jpm = makePosition('JPM', 10, 100, 'Finance')
    const all = [aapl, msft, jpm]
    const result = calculateExposure(aapl, 3000, all)
    // Tech sector = 2000 / 3000 ≈ 66.67%
    expect(result.sectorExposurePercent).toBeCloseTo(66.67, 1)
  })

  it('flags isOverExposed when position > 15% of portfolio', () => {
    const pos = makePosition('AAPL', 20, 100, 'Tech')
    const all = [pos, makePosition('MSFT', 10, 100, 'Finance')]
    const result = calculateExposure(pos, 3000, all)
    expect(result.isOverExposed).toBe(true)
  })

  it('flags isOverExposed when sector > 40% of portfolio', () => {
    const aapl = makePosition('AAPL', 5, 100, 'Tech')
    const msft = makePosition('MSFT', 5, 100, 'Tech')
    const jpm = makePosition('JPM', 1, 100, 'Finance')
    const all = [aapl, msft, jpm]
    // Tech = 1000 / 1100 ≈ 90.9% → over-exposed sector
    const result = calculateExposure(aapl, 1100, all)
    expect(result.isOverExposed).toBe(true)
  })

  it('is NOT overExposed for a small, well-distributed position', () => {
    // 10 positions across 3 sectors: Tech(3), Finance(3), Energy(4)
    // Each position = 10% → below 15% position threshold
    // Sector max = Energy at 40% (4/10) → equal to threshold, NOT strictly over 40%
    const positions = Array.from({ length: 10 }, (_, i) => {
      const sector = i < 3 ? 'Tech' : i < 6 ? 'Finance' : 'Energy'
      return makePosition(`SYM${i}`, 1, 100, sector)
    })
    const pos = positions[6] // Energy position, sector = 40%
    const result = calculateExposure(pos as any, 1000, positions as any)
    // positionPercent = 10% (not > 15%), sectorPercent = 40% (not > 40%)
    expect(result.isOverExposed).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// assessRisk
// ──────────────────────────────────────────────────────────────────────────────

describe('assessRisk', () => {
  it('returns HIGH / ELEVATED risk with contributor flags when overExposed', () => {
    const result = assessRisk({ isOverExposed: true })
    expect(result.riskLevel).toBe('HIGH')
    expect(result.volatilityLevel).toBe('ELEVATED')
    expect(result.contributors).toContain('OVEREXPOSED_POSITION')
    expect(result.contributors).toContain('SECTOR_CONCENTRATION')
  })

  it('returns MEDIUM / NORMAL risk with no contributors when not overExposed', () => {
    const result = assessRisk({ isOverExposed: false })
    expect(result.riskLevel).toBe('MEDIUM')
    expect(result.volatilityLevel).toBe('NORMAL')
    expect(result.contributors).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// calculateFinalConfidence
// ──────────────────────────────────────────────────────────────────────────────

describe('calculateFinalConfidence', () => {
  const base = {
    positionPercent: 10,
    sectorPercent: 30,
    isOverExposed: false,
    unrealizedPnLPercent: 0,
    totalPositions: 5,
  }

  it('returns a number in [0.30, 0.98]', () => {
    const score = calculateFinalConfidence(base)
    expect(score).toBeGreaterThanOrEqual(0.3)
    expect(score).toBeLessThanOrEqual(0.98)
  })

  it('penalises heavily concentrated positions (>30%)', () => {
    const penalised = calculateFinalConfidence({ ...base, positionPercent: 35 })
    const normal = calculateFinalConfidence(base)
    expect(penalised).toBeLessThan(normal)
  })

  it('penalises large sector concentration (>60%)', () => {
    const penalised = calculateFinalConfidence({ ...base, sectorPercent: 65 })
    const normal = calculateFinalConfidence(base)
    expect(penalised).toBeLessThan(normal)
  })

  it('boosts score for strong PnL gains (>20%)', () => {
    const boosted = calculateFinalConfidence({ ...base, unrealizedPnLPercent: 25 })
    const normal = calculateFinalConfidence(base)
    expect(boosted).toBeGreaterThan(normal)
  })

  it('penalises large unrealized losses (<−20%)', () => {
    const penalised = calculateFinalConfidence({ ...base, unrealizedPnLPercent: -25 })
    const normal = calculateFinalConfidence(base)
    expect(penalised).toBeLessThan(normal)
  })

  it('boosts score for well-diversified portfolios (≥8 positions)', () => {
    const boosted = calculateFinalConfidence({ ...base, totalPositions: 10 })
    const normal = calculateFinalConfidence(base)
    expect(boosted).toBeGreaterThan(normal)
  })

  it('penalises low position count (≤2)', () => {
    const penalised = calculateFinalConfidence({ ...base, totalPositions: 2 })
    const normal = calculateFinalConfidence(base)
    expect(penalised).toBeLessThan(normal)
  })

  it('result is clamped to at least 0.30 even for worst-case inputs', () => {
    const worst = calculateFinalConfidence({
      positionPercent: 50,
      sectorPercent: 80,
      isOverExposed: true,
      unrealizedPnLPercent: -30,
      totalPositions: 1,
    })
    expect(worst).toBeGreaterThanOrEqual(0.3)
  })
})
