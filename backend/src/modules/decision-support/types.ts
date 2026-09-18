export interface RawPortfolioRow {
  symbol: string
  quantity: number
  avg_entry_price: number
  sector?: string
}

export type EnrichedPortfolioPosition = {
  symbol: string
  quantity: number
  avg_entry_price: number
  currentValue: number
  unrealizedPnL: number
  unrealizedPnLPercent: number
  sector: string
}

export type PortfolioSummary = {
  totalPositions: number
  totalMarketValue: number
  totalUnrealizedPnL: number
  totalUnrealizedPnLPercent: number
}

export type DecisionType = 'ADD' | 'HOLD' | 'TRIM' | 'EXIT' | 'BUY' | 'SELL'

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'
export type VolatilityLevel = 'NORMAL' | 'ELEVATED'

// Market-level call from determineRecommendation/computeDecision — distinct
// from PortfolioDecision, which is the position-sizing action layered on top
// of it (see determinePortfolioDecision).
export const MarketRecommendation = {
  Buy: 'BUY',
  Sell: 'SELL',
  HoldCaution: 'HOLD / CAUTION',
} as const
export type MarketRecommendation =
  (typeof MarketRecommendation)[keyof typeof MarketRecommendation]

// Position-sizing action for an existing portfolio holding, produced by
// determinePortfolioDecision.
export const PortfolioDecision = {
  Add: 'ADD',
  Hold: 'HOLD',
  Trim: 'TRIM',
  Exit: 'EXIT',
} as const
export type PortfolioDecision =
  (typeof PortfolioDecision)[keyof typeof PortfolioDecision]

export const AnalystRating = {
  StrongBuy: 'STRONG_BUY',
  Buy: 'BUY',
  Hold: 'HOLD',
  Sell: 'SELL',
  StrongSell: 'STRONG_SELL',
} as const
export type AnalystRating = (typeof AnalystRating)[keyof typeof AnalystRating]

export const SentimentTrend = {
  Up: 'UP',
  Down: 'DOWN',
  Flat: 'FLAT',
} as const
export type SentimentTrend =
  (typeof SentimentTrend)[keyof typeof SentimentTrend]

export interface PortfolioPosition {
  symbol: string
  quantity: number
  avgEntryPrice: number
  currentPrice: number
  sector: string
}

export interface BatchDecisionResult {
  symbol: string
  sector: string
  marketDecision: DecisionType
  portfolioDecision: DecisionType
  confidence: number
  riskLevel: RiskLevel
  positionPercentOfPortfolio: number
  sectorExposurePercent: number
}

export type PositionStrategy = {
  add: boolean
  hold: boolean
  trim: boolean
  exit: boolean
}

export type ActionGuidance = {
  positionStrategy: PositionStrategy
  holdDuration: string
  takeProfitZone: string
  stopLossZone: string
  watchFor: string[]
}

export type DecisionResult = {
  symbol: string
  sector: string
  marketDecision: MarketRecommendation
  portfolioDecision: PortfolioDecision
  confidence: number
  riskLevel: RiskLevel
  reasoning: {
    summary: string
    details: string[]
  }
  exposure: {
    positionPercent: number
    sectorPercent: number
    isOverExposed: boolean
  }
  actionGuidance: ActionGuidance
}

export type PriceTargets = {
  entryLow: number
  entryHigh: number
  bullTarget: number
  stopLoss: number
}

export type RadarCard = {
  symbol: string
  sector: string
  currentPrice: number
  atr: number
  entryRange: { low: number; high: number }
  bullTarget: number
  stopLoss: number
  confidence: number // 0–1 from computeDecision()
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW'
  recommendation: MarketRecommendation
  timeHorizon: string
  riskFlags: string[]
}

export type PositionSizeResult = {
  shares: number
  riskPerShare: number
  totalRisk: number
  potentialGain: number
  riskRewardRatio: number
  percentOfCapital: number
}

export type PortfolioRiskMetrics = {
  weightedBeta: number
  portfolioSharpe: number
  perSymbol: {
    symbol: string
    beta: number
    sharpe: number
    volatilityAnnualized: number
  }[]
  sectorConcentration: { sector: string; weight: number }[]
}

export interface TradePlanData {
  symbol: string
  sector?: string
  currentPrice: number
  atr?: number
  recommendation: MarketRecommendation
  confidence: number
  timeHorizon?: string
  entryRange?: { low: number; high: number }
  bullTarget?: number
  stopLoss?: number
  riskFlags?: string[]
  sizing?: {
    capital: number
    shares: number
    totalRisk: number
    potentialGain: number
    riskRewardRatio: number
    percentOfCapital: number
  }
}

export interface PortfolioPdfPayload {
  portfolioData: {
    positions?: Array<{
      symbol: string
      sector?: string
      quantity: number
      avg_entry_price: number
      currentPrice: number
      currentValue: number
      unrealizedPnL: number
      unrealizedPnLPercent: number
    }>
    summary: {
      totalMarketValue: number
      totalUnrealizedPnL: number
      totalUnrealizedPnLPercent: number
      totalPositions: number
    }
  }
  detailedPositions?: Array<{
    symbol: string
    sector?: string
    marketDecision?: MarketRecommendation
    portfolioDecision?: PortfolioDecision
    confidence?: number | null
    riskLevel?: RiskLevel
    beta?: number | null
    sharpe?: number | null
    volatilityAnnualized?: number | null
    reasoning?: {
      summary?: string
      details?: string[]
    }
    exposure?: {
      positionPercent?: number | null
      sectorPercent?: number | null
      isOverExposed?: boolean
    }
    actionGuidance?: {
      positionStrategy?: {
        add: boolean
        hold: boolean
        trim: boolean
        exit: boolean
      } | null
      holdDuration?: string
      takeProfitZone?: string
      stopLossZone?: string
      watchFor?: string[]
    }
  }>
  riskMetrics?: {
    weightedBeta: number
    portfolioSharpe: number
    perSymbol?: Array<{
      symbol: string
      beta?: number | null
      sharpe?: number | null
      volatilityAnnualized?: number | null
    }>
  } | null
}

