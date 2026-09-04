export interface DashboardBriefing {
  greeting: string;
  generatedAt: string;
  decisionSupport: {
    available: boolean;
    reason: string | null;
    summary?: {
      buySignals: number;
      holdSignals: number;
      trimSignals: number;
      positionsAtRisk: number;
      lastRunAt: string;
    };
    headline: string | null;
  };
  portfolioAlert: {
    overexposedSectors: string[];
    stopLossBreaches: number;
    entryZonesActive: number;
    headline: string;
  } | null;
}

export interface PortfolioHealth {
  score: number;
  band: string;
  label: string;
  breakdown: {
    diversification: number;
    riskReward: number;
    volatility: number;
    alertHealth: number;
    watchlistDiscipline: number;
  };
}

export interface PortfolioSnapshot {
  available: boolean;
  reason?: string;
  totalValue?: number;
  totalUnrealizedPnL?: number;
  totalUnrealizedPnLPct?: number;
  todayGainLoss?: number;
  todayGainLossPct?: number;
  bestPerformer?: {
    symbol: string;
    changePercent: number;
  } | null;
  worstPerformer?: {
    symbol: string;
    changePercent: number;
  } | null;
  healthScore?: PortfolioHealth;
}

export interface ImpactNewsItem {
  id: string;
  headline: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  symbol: string;
  impact: 'POSITIVE_HOLDING' | 'NEGATIVE_HOLDING' | 'NEUTRAL';
  sharesHeld: number;
  publishedAt: string;
  source: string;
  url: string;
}

export interface SmartTrigger {
  type: string;
  symbol: string;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  context: string;
  action: string;
}

export interface SectorHeatmapCell {
  name: string;
  performance: {
    '1d': number;
    '5d': number;
    '1m': number;
  };
  userExposurePct: number;
  userSymbols: string[];
  signal: 'NO_EXPOSURE' | 'NEUTRAL' | 'BUY' | 'SELL' | 'OVEREXPOSED' | 'BLIND_SPOT';
}

export interface TrendingStock {
  rank: number;
  symbol: string;
  companyName: string;
  logoUrl: string;
  price: number;
  changePercent: number;
  sparkline?: number[];
}

export interface DashboardData {
  briefing: DashboardBriefing;
  portfolio: PortfolioSnapshot;
  impactNews: {
    items: ImpactNewsItem[];
    totalCount: number;
  };
  smartTriggers: {
    items: SmartTrigger[];
    totalCount: number;
  };
  sectorHeatmap: {
    cachedAt: string;
    sectors: SectorHeatmapCell[];
  };
  trendingStocks: TrendingStock[];
}
