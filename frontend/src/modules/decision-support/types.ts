export interface PortfolioSummary {
  totalPositions: number;
  totalMarketValue: number;
  totalUnrealizedPnL: number;
  totalUnrealizedPnLPercent: number;
}

export interface PositionBase {
  symbol: string;
  quantity: number;
  avg_entry_price: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  sector?: string;
}

export interface OverviewDecision {
  symbol: string;
  sector: string;
  marketDecision: string;
  portfolioDecision: string;
  confidence: number;
  riskLevel: string;
  beta?: number;
  sharpe?: number;
  volatilityAnnualized?: number;
}

export interface DetailedDecision extends OverviewDecision {
  reasoning: { summary: string; details: string[] };
  exposure: { positionPercent: number; sectorPercent: number; isOverExposed: boolean };
  actionGuidance: {
    positionStrategy: { add: boolean; hold: boolean; trim: boolean; exit: boolean };
    holdDuration: string;
    takeProfitZone: string;
    stopLossZone: string;
    watchFor: string[];
  };
}

export type MergedRow = PositionBase & Partial<OverviewDecision> & {
  beta?: number;
  sharpe?: number;
  volatilityAnnualized?: number;
};

export interface PortfolioData {
  portfolioId: string;
  summary: PortfolioSummary;
  positions: PositionBase[];
}

export interface PriceTargets {
  entryLow: number;
  entryHigh: number;
  bullTarget: number;
  stopLoss: number;
}

export interface RadarCard {
  symbol: string;
  sector: string;
  currentPrice: number;
  atr: number;
  entryRange: { low: number; high: number };
  bullTarget: number;
  stopLoss: number;
  confidence: number;
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendation: string;
  timeHorizon: string;
  riskFlags: string[];
}

export interface PositionSizeResult {
  symbol: string;
  capital: number;
  currentPrice: number;
  stopLoss: number;
  bullTarget: number;
  atr?: number;
  recommendation?: string;
  confidence?: number;
  shares: number;
  riskPerShare: number;
  totalRisk: number;
  potentialGain: number;
  riskRewardRatio: number;
  percentOfCapital: number;
}

export interface PortfolioRiskMetrics {
  weightedBeta: number;
  portfolioSharpe: number;
  perSymbol: {
    symbol: string;
    beta: number;
    sharpe: number;
    volatilityAnnualized: number;
  }[];
  sectorConcentration: { sector: string; weight: number }[];
}

export interface MarketDecisionData {
  symbol: string;
  timestamp: string;
  marketContext: {
    marketStatus: string;
    lastClosePrice: number;
  };
  analystConsensus: {
    rating: string;
    confidencePercent: number;
    sourceCount: number;
  };
  priceState: {
    current: number;
    trend: string;
    rsi: number;
    isOverbought: boolean;
  };
  sentimentState: {
    score: number;
    trend: string;
    change48hPercent: number;
    newsVolume: number;
  };
  decision: {
    recommendation: string;
    timeHorizon: string;
    confidence: number;
  };
  atr?: number;
  priceTargets?: PriceTargets;
  reasoning: {
    summary: string;
    details: string[];
  };
  riskFlags: string[];
  actionGuidance: {
    buyWindow?: string | null;
    holdWindow?: string | null;
    sellWindow?: string | null;
    watchFor?: string | null;
  };
}

