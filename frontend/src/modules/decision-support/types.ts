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

export type MergedRow = PositionBase & Partial<OverviewDecision>;

export interface PortfolioData {
  portfolioId: string;
  summary: PortfolioSummary;
  positions: PositionBase[];
}
