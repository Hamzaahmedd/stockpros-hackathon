import { describe, it, expect } from '@jest/globals'
import { generateForecastPdfBuffer } from './pdf-generator'

describe('Forecast PDF Generator', () => {
  it('generates a valid PDF buffer for forecast data', async () => {
    const mockData = {
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

    const buffer = await generateForecastPdfBuffer(mockData)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(1000)
    // PDF magic bytes %PDF
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })
})
