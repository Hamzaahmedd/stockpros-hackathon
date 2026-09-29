jest.mock('../../../shared/infrastructure/clients/ml-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../../watchlist', () => ({
  getTechnicalBaselines: jest.fn(),
}))

jest.mock('../earnings-checker', () => ({
  getEarningsWithinWindow: jest.fn(),
}))

import mlClient from '../../../shared/infrastructure/clients/ml-client'
import { getTechnicalBaselines } from '../../watchlist'
import { getEarningsWithinWindow } from '../earnings-checker'
import { getForecast } from '../service'

const mockMlGet = (mlClient as unknown as { get: jest.Mock }).get

const baseTechnicals = {
  atr: 2,
  ema: 100,
  swingLow: null as number | null,
  resistance: null as number | null,
  currentPrice: undefined as number | undefined,
}

const predictions = (prices: number[]) =>
  prices.map((price, i) => ({ date: `2024-01-0${i + 1}`, price }))

beforeEach(() => {
  jest.clearAllMocks()
  ;(getEarningsWithinWindow as jest.Mock).mockResolvedValue(null)
  ;(getTechnicalBaselines as jest.Mock).mockResolvedValue({ ...baseTechnicals })
})

describe('getForecast — error handling', () => {
  it('wraps an ML client failure in a generic, symbol-scoped error', async () => {
    mockMlGet.mockRejectedValue(new Error('ml service down'))
    await expect(getForecast('AAPL', '5d')).rejects.toThrow(
      'Failed to fetch and process forecast for AAPL',
    )
  })

  it('wraps a non-Error rejection from the ML client the same way', async () => {
    mockMlGet.mockRejectedValue('ml service down') // rejected with a plain string, not an Error
    await expect(getForecast('AAPL', '5d')).rejects.toThrow(
      'Failed to fetch and process forecast for AAPL',
    )
  })

  it('logs a non-Error rejection from the baselines lookup without crashing the request', async () => {
    mockMlGet.mockResolvedValue({
      data: { symbol: 'AAPL', period: '5d', predictions: [] },
    })
    ;(getTechnicalBaselines as jest.Mock).mockRejectedValue('baselines down') // not an Error instance
    await expect(getForecast('AAPL', '5d')).resolves.toBeDefined()
  })

  it('still fails the whole request if the earnings-window lookup itself rejects (not just returns null)', async () => {
    mockMlGet.mockResolvedValue({ data: { predictions: [] } })
    ;(getEarningsWithinWindow as jest.Mock).mockRejectedValue(
      new Error('finnhub down'),
    )
    await expect(getForecast('AAPL', '5d')).rejects.toThrow(
      'Failed to fetch and process forecast for AAPL',
    )
  })
})

describe('getForecast — degraded inputs', () => {
  it('returns raw ML data with no enhancement when technical baselines fail to load', async () => {
    mockMlGet.mockResolvedValue({
      data: {
        symbol: 'AAPL',
        period: '5d',
        predictions: predictions([100, 101]),
      },
    })
    ;(getTechnicalBaselines as jest.Mock).mockRejectedValue(
      new Error('baselines down'),
    )

    const result = await getForecast('AAPL', '5d')
    expect(result.targetRange).toBeUndefined()
    expect(result.directionalBias).toBeUndefined()
    expect(result.predictions).toEqual([])
  })

  it('returns no enhancement when the ML response has no predictions', async () => {
    mockMlGet.mockResolvedValue({
      data: { symbol: 'AAPL', period: '5d', predictions: [] },
    })
    const result = await getForecast('AAPL', '5d')
    expect(result.targetRange).toBeUndefined()
    expect(result.predictions).toEqual([])
  })

  it('treats a response with no predictions field at all the same as an empty array', async () => {
    mockMlGet.mockResolvedValue({ data: { symbol: 'AAPL', period: '5d' } })
    const result = await getForecast('AAPL', '5d')
    expect(result.predictions).toEqual([])
  })
})

describe('getForecast — earnings overlay', () => {
  it('attaches an earnings overlay and widens the target band when earnings fall within the window', async () => {
    mockMlGet.mockResolvedValue({
      data: {
        symbol: 'AAPL',
        period: '5d',
        predictions: predictions([100, 101, 102]),
      },
    })
    ;(getEarningsWithinWindow as jest.Mock).mockResolvedValue({
      earningsDate: '2024-01-10',
      daysUntilEarnings: 3,
    })

    const noEarnings = await (async () => {
      ;(getEarningsWithinWindow as jest.Mock).mockResolvedValueOnce(null)
      return getForecast('AAPL', '5d')
    })()

    const withEarnings = await getForecast('AAPL', '5d')

    expect(withEarnings.earningsOverlay).toEqual({
      earningsWarning: true,
      earningsDate: '2024-01-10',
      daysUntilEarnings: 3,
    })
    // Earnings widen the band (EARNINGS_ATR_MULT=2.5 vs ATR_MULT=1.5), so the
    // bull target should be further from the period high than without earnings.
    expect(withEarnings.targetRange!.bull).toBeGreaterThan(
      noEarnings.targetRange!.bull,
    )
    // Earnings always force LOW confidence regardless of technical convergence.
    expect(withEarnings.targetRange!.confidence).toBe('LOW')
  })
})

describe('getForecast — target range confidence', () => {
  it('reports HIGH confidence when EMA and swing low have converged', async () => {
    mockMlGet.mockResolvedValue({
      data: {
        symbol: 'AAPL',
        period: '5d',
        predictions: predictions([100, 101]),
      },
    })
    ;(getTechnicalBaselines as jest.Mock).mockResolvedValue({
      ...baseTechnicals,
      ema: 100,
      swingLow: 99.5, // divergence = 0.5/100 = 0.5% <= 1% threshold... use exact
    })
    const result = await getForecast('AAPL', '5d')
    expect(result.targetRange!.confidence).toBe('HIGH')
  })

  it('reports MEDIUM confidence when EMA and swing low have diverged', async () => {
    mockMlGet.mockResolvedValue({
      data: {
        symbol: 'AAPL',
        period: '5d',
        predictions: predictions([100, 101]),
      },
    })
    ;(getTechnicalBaselines as jest.Mock).mockResolvedValue({
      ...baseTechnicals,
      ema: 100,
      swingLow: 80, // divergence = 20/100 = 20% > 1% threshold
    })
    const result = await getForecast('AAPL', '5d')
    expect(result.targetRange!.confidence).toBe('MEDIUM')
  })

  it('reports LOW confidence when there is no swing low to compare against', async () => {
    mockMlGet.mockResolvedValue({
      data: {
        symbol: 'AAPL',
        period: '5d',
        predictions: predictions([100, 101]),
      },
    })
    const result = await getForecast('AAPL', '5d')
    expect(result.targetRange!.confidence).toBe('LOW')
  })

  it('clamps the bull target to resistance when resistance sits inside the projected band', async () => {
    mockMlGet.mockResolvedValue({
      data: {
        symbol: 'AAPL',
        period: '5d',
        predictions: predictions([100, 105]),
      },
    })
    ;(getTechnicalBaselines as jest.Mock).mockResolvedValue({
      ...baseTechnicals,
      resistance: 106, // between periodHigh (105) and the unclamped bull target
    })
    const result = await getForecast('AAPL', '5d')
    expect(result.targetRange!.bull).toBe(106)
  })

  it('ignores resistance that sits below the period high', async () => {
    mockMlGet.mockResolvedValue({
      data: {
        symbol: 'AAPL',
        period: '5d',
        predictions: predictions([100, 105]),
      },
    })
    ;(getTechnicalBaselines as jest.Mock).mockResolvedValue({
      ...baseTechnicals,
      resistance: 50, // below periodHigh, must not clamp
    })
    const result = await getForecast('AAPL', '5d')
    expect(result.targetRange!.bull).not.toBe(50)
  })

  it('clamps the bear target to swing-low-derived support when it sits inside the projected band', async () => {
    mockMlGet.mockResolvedValue({
      data: {
        symbol: 'AAPL',
        period: '5d',
        predictions: predictions([100, 105]),
      },
    })
    ;(getTechnicalBaselines as jest.Mock).mockResolvedValue({
      ...baseTechnicals,
      ema: 100,
      swingLow: 99, // support = max(ema, swingLow) = 100, within (summaryBear, periodLow]
    })
    const result = await getForecast('AAPL', '5d')
    expect(result.targetRange!.bear).toBe(100)
  })
})

describe('getForecast — ML price field fallback', () => {
  it('falls back to predicted_close when price is absent from an ML prediction row', async () => {
    mockMlGet.mockResolvedValue({
      data: {
        symbol: 'AAPL',
        period: '5d',
        predictions: [
          { date: '2024-01-01', predicted_close: 100 },
          { date: '2024-01-02', predicted_close: 101 },
        ],
      },
    })
    const result = await getForecast('AAPL', '5d')
    expect(result.targetRange!.base).toBe(101)
    expect(result.predictions![0].base).toBe(100)
  })
})

describe('getForecast — per-point predictions', () => {
  it('scales the funnel width with the forecast day and clamps points to resistance/support', async () => {
    mockMlGet.mockResolvedValue({
      data: {
        symbol: 'AAPL',
        period: '5d',
        predictions: predictions([100, 100, 100, 100, 100]),
      },
    })
    ;(getTechnicalBaselines as jest.Mock).mockResolvedValue({
      ...baseTechnicals,
      resistance: 100.5,
      ema: 100,
      swingLow: 99,
    })

    const result = await getForecast('AAPL', '5d')
    const [day1, , , , day5] = result.predictions!

    // Day 5's unclamped bull would be further out than day 1's, but both
    // clamp to the same resistance ceiling once it's inside the funnel.
    expect(day1.bull).toBeLessThanOrEqual(100.5)
    expect(day5.bull).toBe(100.5)
    expect(day5.bear).toBe(100) // clamped to support = max(ema, swingLow)
  })
})

describe('getForecast — directional bias', () => {
  it('signals BULLISH/ACCUMULATE when price trades meaningfully above the EMA', async () => {
    mockMlGet.mockResolvedValue({
      data: { symbol: 'AAPL', period: '5d', predictions: predictions([110]) },
    })
    ;(getTechnicalBaselines as jest.Mock).mockResolvedValue({
      ...baseTechnicals,
      ema: 100,
      currentPrice: 110,
    })
    const result = await getForecast('AAPL', '5d')
    expect(result.directionalBias).toMatchObject({
      signal: 'BULLISH',
      posture: 'ACCUMULATE',
    })
  })

  it('signals BEARISH/DEFENSIVE when price trades meaningfully below the EMA', async () => {
    mockMlGet.mockResolvedValue({
      data: { symbol: 'AAPL', period: '5d', predictions: predictions([90]) },
    })
    ;(getTechnicalBaselines as jest.Mock).mockResolvedValue({
      ...baseTechnicals,
      ema: 100,
      currentPrice: 90,
    })
    const result = await getForecast('AAPL', '5d')
    expect(result.directionalBias).toMatchObject({
      signal: 'BEARISH',
      posture: 'DEFENSIVE',
    })
  })

  it('signals NEUTRAL/HOLD when price is consolidating near the EMA', async () => {
    mockMlGet.mockResolvedValue({
      data: { symbol: 'AAPL', period: '5d', predictions: predictions([100.1]) },
    })
    ;(getTechnicalBaselines as jest.Mock).mockResolvedValue({
      ...baseTechnicals,
      ema: 100,
      currentPrice: 100.1,
    })
    const result = await getForecast('AAPL', '5d')
    expect(result.directionalBias).toMatchObject({
      signal: 'NEUTRAL',
      posture: 'HOLD',
    })
  })

  it('falls back to the first prediction price, then EMA, when currentPrice is unavailable', async () => {
    mockMlGet.mockResolvedValue({
      data: { symbol: 'AAPL', period: '5d', predictions: predictions([110]) },
    })
    ;(getTechnicalBaselines as jest.Mock).mockResolvedValue({
      ...baseTechnicals,
      ema: 100,
      currentPrice: undefined,
    })
    const result = await getForecast('AAPL', '5d')
    // refPrice falls back to basePrices[0] = 110 -> bullish vs ema 100
    expect(result.directionalBias!.signal).toBe('BULLISH')
  })
})
