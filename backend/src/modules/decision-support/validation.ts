import { z } from 'zod'

export const PortfolioRowValidator = z.object({
  symbol: z.string().min(1, 'Invalid symbol'),
  quantity: z.number().positive('Invalid quantity'),
  avg_entry_price: z.number().positive('Invalid avg_entry_price'),
  sector: z.string().optional(),
})

export const PortfolioArrayValidator = z.array(PortfolioRowValidator)

export const decisionQueryValidator = z.object({
  symbol: z.string().min(1).max(10),
})

export const portfolioDecisionValidator = z.object({
  symbol: decisionQueryValidator.shape.symbol,
  marketDecision: z.object({
    recommendation: z.enum(['BUY', 'SELL', 'HOLD', 'HOLD / CAUTION']),
    confidence: z.number().min(0).max(1),
    rsi: z.number().min(0).max(100),
    riskFlags: z.array(z.string()),
  }),
  position: z.object({
    symbol: z.string().min(1).max(10),
    quantity: z.number().positive(),
    avgEntryPrice: z.number().positive(),
    currentValue: z.number().positive(),
    unrealizedPnL: z.number(),
    unrealizedPnLPercent: z.number(),
    sector: z.string().min(1),
  }),
  portfolioSummary: z.object({
    totalMarketValue: z.number().positive(),
    sectorExposure: z.record(z.string(), z.number()),
  }),
})

export const portfolioDecisionRequestValidator = z.object({
  portfolioId: z.string(),
  decisionMode: z.enum(['OVERVIEW', 'DETAILED']),
  symbol: z.string().optional(),
})

export const positionSizeValidator = z.object({
  capital: z.number().positive().max(10_000_000),
  symbol: z.string().min(1).max(10),
})

export const portfolioRiskMetricsValidator = z.object({
  portfolioId: z.string().min(1),
})

export const opportunityRadarQueryValidator = z.object({
  timeline: z.enum(['1D', '1W']).optional(),
})

