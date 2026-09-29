import { describe, it, expect, jest, beforeEach } from '@jest/globals'

jest.mock('../../../shared/utils', () => ({
  ...(jest.requireActual('../../../shared/utils') as object),
  getStockProsLogoDataUri: jest.fn(),
}))

import { getStockProsLogoDataUri } from '../../../shared/utils'
import {
  generateTradePlanPdfBuffer,
  generatePortfolioReportPdfBuffer,
} from '../pdf-generator'
import type { PortfolioPdfPayload, TradePlanData } from '../types'

const mockGetLogo = getStockProsLogoDataUri as jest.MockedFunction<
  typeof getStockProsLogoDataUri
>
const realGetStockProsLogoDataUri = (
  jest.requireActual('../../../shared/utils') as {
    getStockProsLogoDataUri: () => Promise<string | null>
  }
).getStockProsLogoDataUri

beforeEach(() => {
  // Default to the real local logo asset (matches production behavior);
  // individual tests below override this to exercise the addImage failure path.
  mockGetLogo.mockImplementation(realGetStockProsLogoDataUri)
})

describe('Decision Support PDF Generators', () => {
  it('generates a valid Trade Plan PDF buffer', async () => {
    const mockPlan: TradePlanData = {
      symbol: 'NVDA',
      sector: 'Technology',
      currentPrice: 120.5,
      atr: 4.2,
      recommendation: 'BUY',
      confidence: 0.85,
      timeHorizon: 'Short-to-Medium Term',
      entryRange: { low: 118.0, high: 122.0 },
      bullTarget: 130.0,
      stopLoss: 112.0,
      riskFlags: ['HIGH_VOLATILITY'],
      sizing: {
        capital: 10000,
        shares: 50,
        totalRisk: 425,
        potentialGain: 475,
        riskRewardRatio: 1.12,
        percentOfCapital: 60.25,
      },
    }

    const buffer = await generateTradePlanPdfBuffer(mockPlan)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('styles a SELL recommendation in red and still renders when the logo image fails to load', async () => {
    mockGetLogo.mockResolvedValue('not-a-real-image-data-uri')

    const mockPlan: TradePlanData = {
      symbol: 'GME',
      sector: 'Consumer',
      currentPrice: 20,
      atr: 1,
      recommendation: 'SELL',
      confidence: 0.6,
      timeHorizon: 'Short Term',
      entryRange: { low: 19, high: 21 },
      bullTarget: 15,
      stopLoss: 22,
      // Enough flags to push the disclaimer box past the page's remaining
      // height, exercising the "reposition the box upward" overflow branch.
      riskFlags: Array.from({ length: 30 }, (_, i) => `RISK_FLAG_${i}`),
      sizing: {
        capital: 10000,
        shares: 500,
        totalRisk: 1000,
        potentialGain: 500,
        riskRewardRatio: 0.5,
        percentOfCapital: 100,
      },
    }

    const buffer = await generateTradePlanPdfBuffer(mockPlan)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('styles a neutral/other recommendation in the default warning color', async () => {
    const mockPlan: TradePlanData = {
      symbol: 'F',
      sector: 'Industrials',
      currentPrice: 12,
      atr: 0.5,
      recommendation: 'HOLD / CAUTION',
      confidence: 0.5,
      timeHorizon: 'Short Term',
      entryRange: { low: 11, high: 13 },
      bullTarget: 14,
      stopLoss: 10,
      riskFlags: [],
      sizing: {
        capital: 5000,
        shares: 100,
        totalRisk: 200,
        potentialGain: 200,
        riskRewardRatio: 1,
        percentOfCapital: 50,
      },
    }

    const buffer = await generateTradePlanPdfBuffer(mockPlan)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('generates a valid Portfolio Health Report PDF buffer', async () => {
    const mockPayload: PortfolioPdfPayload = {
      portfolioData: {
        positions: [
          {
            symbol: 'AAPL',
            sector: 'Technology',
            quantity: 10,
            avg_entry_price: 150,
            currentPrice: 180,
            currentValue: 1800,
            unrealizedPnL: 300,
            unrealizedPnLPercent: 20.0,
          },
        ],
        summary: {
          totalMarketValue: 1800,
          totalUnrealizedPnL: 300,
          totalUnrealizedPnLPercent: 20.0,
          totalPositions: 1,
        },
      },
      detailedPositions: [
        {
          symbol: 'AAPL',
          sector: 'Technology',
          marketDecision: 'HOLD / CAUTION',
          portfolioDecision: 'HOLD',
          confidence: 0.75,
          riskLevel: 'LOW',
          beta: 1.1,
          sharpe: 1.8,
          reasoning: {
            summary: 'Strong balance sheet and momentum',
            details: ['Low debt', 'Earnings beat'],
          },
        },
      ],
      riskMetrics: {
        weightedBeta: 1.1,
        portfolioSharpe: 1.8,
        perSymbol: [{ symbol: 'AAPL', beta: 1.1, sharpe: 1.8 }],
      },
    }

    const buffer = await generatePortfolioReportPdfBuffer(mockPayload)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('still renders the Portfolio Health Report when the logo image fails to load', async () => {
    mockGetLogo.mockResolvedValue('not-a-real-image-data-uri')

    const mockPayload: PortfolioPdfPayload = {
      portfolioData: {
        positions: [
          {
            symbol: 'AAPL',
            sector: 'Technology',
            quantity: 10,
            avg_entry_price: 150,
            currentPrice: 180,
            currentValue: 1800,
            unrealizedPnL: 300,
            unrealizedPnLPercent: 20.0,
          },
        ],
        summary: {
          totalMarketValue: 1800,
          totalUnrealizedPnL: 300,
          totalUnrealizedPnLPercent: 20.0,
          totalPositions: 1,
        },
      },
      detailedPositions: [],
      riskMetrics: {
        weightedBeta: 1.1,
        portfolioSharpe: 1.8,
        perSymbol: [{ symbol: 'AAPL', beta: 1.1, sharpe: 1.8 }],
      },
    }

    const buffer = await generatePortfolioReportPdfBuffer(mockPayload)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })
})
