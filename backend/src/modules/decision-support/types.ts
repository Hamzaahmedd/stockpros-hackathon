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
  marketDecision: string
  portfolioDecision: string
  confidence: number
  riskLevel: string
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
  recommendation: string // 'BUY' | 'SELL' | 'HOLD / CAUTION'
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
