jest.mock('../../../shared/infrastructure/clients/twelve-data-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    watchlist: { update: jest.fn() },
  },
}))

import twelveDataClient from '../../../shared/infrastructure/clients/twelve-data-client'
import { prisma } from '../../../shared/infrastructure/database'
import {
  computeAndStoreAiZones,
  getTechnicalBaselines,
} from '../evaluators/ai-zone-calculator'

const mockGet = (twelveDataClient as unknown as { get: jest.Mock }).get
const mockUpdate = (prisma as unknown as { watchlist: { update: jest.Mock } })
  .watchlist.update

/** Builds `n` ascending (oldest-first) flat OHLC candles, then reverses and
 * stringifies them the way Twelve Data's API actually returns values
 * (newest-first, numbers as strings) so the mock matches the real contract. */
const toTwelveDataResponse = (
  candles: { high: number; low: number; close: number }[],
) => ({
  data: {
    status: 'ok',
    values: candles
      .map((c, i) => ({
        datetime: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: String(c.close),
        high: String(c.high),
        low: String(c.low),
        close: String(c.close),
        volume: '1000',
      }))
      .reverse(),
  },
})

const buildBaseline = (n: number) =>
  Array.from({ length: n }, () => ({ high: 101, low: 99, close: 100 }))

// Scenario A: dip at index 25 (divergence 0.5% -> HIGH confidence) + peak at
// index 20 (resistance 110, above the 2:1 floor -> resistance wins).
// Expected values cross-checked independently: ema=100, atr≈2.5214286,
// swingLow=99.5, entry=99.5, stopLoss≈95.7178571, takeProfit=110.
const scenarioA = () => {
  const candles = buildBaseline(34)
  candles[24].low = 99.6
  candles[25].low = 99.5
  candles[26].low = 99.6
  candles[19].high = 101
  candles[20].high = 110
  candles[21].high = 101
  return candles
}

// Scenario B: pure flat, no dip/peak -> LOW confidence, no resistance, floor
// takeProfit. Expected: ema=100, atr=2, swingLow=null, entry=100,
// stopLoss=97, takeProfit=106 (2:1 floor).
const scenarioB = () => buildBaseline(34)

// Scenario C: a much deeper dip (divergence 10%) -> MEDIUM confidence.
// Expected: ema=100, swingLow=90.
const scenarioC = () => {
  const candles = buildBaseline(34)
  candles[24].low = 99.6
  candles[25].low = 90
  candles[26].low = 99.6
  return candles
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getTechnicalBaselines', () => {
  it('computes EMA/ATR/swingLow/resistance/currentPrice from real candle data', async () => {
    mockGet.mockResolvedValue(toTwelveDataResponse(scenarioA()))
    const result = await getTechnicalBaselines('AAPL')
    expect(result.ema).toBeCloseTo(100, 5)
    expect(result.atr).toBeCloseTo(2.5214285714285722, 5)
    expect(result.swingLow).toBeCloseTo(99.5, 5)
    expect(result.resistance).toBe(110)
    expect(result.currentPrice).toBe(100)
  })

  it('throws when Twelve Data reports an error status', async () => {
    mockGet.mockResolvedValue({
      data: { status: 'error', message: 'invalid symbol' },
    })
    await expect(getTechnicalBaselines('BADSYM')).rejects.toThrow(
      'Twelve Data error for BADSYM: invalid symbol',
    )
  })

  it('throws when Twelve Data returns no candle values', async () => {
    mockGet.mockResolvedValue({ data: { status: 'ok', values: [] } })
    await expect(getTechnicalBaselines('AAPL')).rejects.toThrow(
      'No candle data returned for AAPL',
    )
  })

  it('throws when there is not enough history for a 20-day EMA + 14-day ATR', async () => {
    mockGet.mockResolvedValue(toTwelveDataResponse(buildBaseline(10)))
    await expect(getTechnicalBaselines('AAPL')).rejects.toThrow(
      'Insufficient candle history for AAPL: got 10, need 34',
    )
  })
})

describe('computeAndStoreAiZones', () => {
  it('scores HIGH confidence and uses resistance as the take-profit when it clears the 2:1 floor', async () => {
    mockGet.mockResolvedValue(toTwelveDataResponse(scenarioA()))
    mockUpdate.mockResolvedValue({})

    await computeAndStoreAiZones('user-1', 'AAPL')

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { userId_symbol: { userId: 'user-1', symbol: 'AAPL' } },
      data: expect.objectContaining({
        aiSuggestedEntry: 99.5,
        aiTakeProfit: 110,
        aiConfidence: 'HIGH',
      }),
    })
    const basis = mockUpdate.mock.calls[0][0].data.aiSuggestionBasis as string
    expect(basis).toContain('Entry near swing low support')
    expect(basis).toContain('Take profit at prior resistance level')
  })

  it('scores LOW confidence and floors take-profit at 2:1 when there is no swing low or resistance', async () => {
    mockGet.mockResolvedValue(toTwelveDataResponse(scenarioB()))
    mockUpdate.mockResolvedValue({})

    await computeAndStoreAiZones('user-1', 'AAPL')

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { userId_symbol: { userId: 'user-1', symbol: 'AAPL' } },
      data: expect.objectContaining({
        aiSuggestedEntry: 100,
        aiStopLoss: 97,
        aiTakeProfit: 106,
        aiConfidence: 'LOW',
      }),
    })
    const basis = mockUpdate.mock.calls[0][0].data.aiSuggestionBasis as string
    expect(basis).toContain('Entry near 20-day EMA support')
    expect(basis).toContain('no clear resistance found')
  })

  it('scores MEDIUM confidence when EMA and swing low have diverged by more than 1%', async () => {
    mockGet.mockResolvedValue(toTwelveDataResponse(scenarioC()))
    mockUpdate.mockResolvedValue({})

    await computeAndStoreAiZones('user-1', 'AAPL')

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ aiConfidence: 'MEDIUM' }),
      }),
    )
  })

  it('suppresses the entire suggestion — writes nothing — when Twelve Data fails', async () => {
    mockGet.mockRejectedValue(new Error('twelve data down'))
    await computeAndStoreAiZones('user-1', 'AAPL')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('suppresses the entire suggestion when there is insufficient candle history', async () => {
    mockGet.mockResolvedValue(toTwelveDataResponse(buildBaseline(10)))
    await computeAndStoreAiZones('user-1', 'AAPL')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('suppresses the entire suggestion — no partial write — when persisting fails', async () => {
    mockGet.mockResolvedValue(toTwelveDataResponse(scenarioA()))
    mockUpdate.mockRejectedValue(new Error('db down'))
    await expect(
      computeAndStoreAiZones('user-1', 'AAPL'),
    ).resolves.toBeUndefined()
  })
})
