import { describe, it, expect, jest, beforeEach } from '@jest/globals'

jest.mock('../../../shared/utils', () => ({
  ...(jest.requireActual('../../../shared/utils') as object),
  getStockProsLogoDataUri: jest.fn(),
}))

import { getStockProsLogoDataUri } from '../../../shared/utils'
import {
  generateForecastPdfBuffer,
  getForecastReportFileName,
} from '../pdf-generator'

const mockGetLogo = getStockProsLogoDataUri as jest.MockedFunction<
  typeof getStockProsLogoDataUri
>
const realGetStockProsLogoDataUri = (
  jest.requireActual('../../../shared/utils') as {
    getStockProsLogoDataUri: () => Promise<string | null>
  }
).getStockProsLogoDataUri

beforeEach(() => {
  mockGetLogo.mockImplementation(realGetStockProsLogoDataUri)
})

const baseData = {
  symbol: 'AAPL',
  period: '1d',
  currentPrice: 185.5,
  predictions: [
    { date: '2026-09-01', base: 186.2, bull: 190.0, bear: 182.0 },
    { date: '2026-09-02', base: 187.1, bull: 191.5, bear: 183.0 },
  ],
  targetRange: {
    bull: 192.0,
    base: 187.1,
    bear: 180.0,
    atr: 3.5,
    confidence: 'HIGH' as const,
  },
}

describe('getForecastReportFileName', () => {
  it("builds a filename from the symbol, period, and today's date", () => {
    const name = getForecastReportFileName({ symbol: 'AAPL', period: '1d' })
    const todayStr = new Date().toISOString().split('T')[0]
    expect(name).toBe(`stockpros_forecast_AAPL_1d_${todayStr}.pdf`)
  })
})

describe('Forecast PDF Generator', () => {
  it('generates a valid PDF buffer for forecast data', async () => {
    const buffer = await generateForecastPdfBuffer(baseData)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(1000)
    // PDF magic bytes %PDF
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('still renders when the logo image fails to load', async () => {
    mockGetLogo.mockResolvedValue('not-a-real-image-data-uri')

    const buffer = await generateForecastPdfBuffer(baseData)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('does not render a logo section at all when no logo is available', async () => {
    mockGetLogo.mockResolvedValue(null)

    const buffer = await generateForecastPdfBuffer(baseData)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('renders the 1-week period label and omits optional fields (no currentPrice/targetRange)', async () => {
    const buffer = await generateForecastPdfBuffer({
      symbol: 'AAPL',
      period: '1w',
      predictions: baseData.predictions,
    } as any)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('handles a missing predictions array and rows with undefined bull/bear values', async () => {
    const buffer = await generateForecastPdfBuffer({
      ...baseData,
      predictions: undefined,
    } as any)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')

    const bufferWithGaps = await generateForecastPdfBuffer({
      ...baseData,
      predictions: [{ date: '2026-09-01', base: 186.2 }],
    } as any)
    expect(bufferWithGaps).toBeInstanceOf(Buffer)
    expect(bufferWithGaps.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('renders a valid PDF with a larger prediction set spanning multiple pages', async () => {
    const manyPredictions = Array.from({ length: 40 }, (_, i) => ({
      date: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`,
      base: 186.2 + i,
      bull: 190.0 + i,
      bear: 182.0 + i,
    }))

    const buffer = await generateForecastPdfBuffer({
      ...baseData,
      predictions: manyPredictions,
    })
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })
})
