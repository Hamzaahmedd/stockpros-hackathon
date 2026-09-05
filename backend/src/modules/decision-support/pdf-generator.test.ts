import { describe, it, expect } from '@jest/globals'
import {
  generateTradePlanPdfBuffer,
  generatePortfolioReportPdfBuffer,
} from './pdf-generator'

describe('Decision Support PDF Generators', () => {
  it('generates a valid Trade Plan PDF buffer', async () => {
    const mockPlan = {
      symbol: 'NVDA',
      sector: 'Technology',
      currentPrice: 120.5,
      atr: 4.2,
      recommendation: 'BUY (CONFIRMED)',
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

  it('generates a valid Portfolio Health Report PDF buffer', async () => {
    const mockPayload = {
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
          marketDecision: 'HOLD',
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
})
