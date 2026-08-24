export interface AiSuggested {
  entry: number;
  takeProfit: number;
  stopLoss: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  basis: string;
  computedAt: string;
}

export interface PortfolioFit {
  currentSectorExposure: string;
  projectedSectorExposure: string;
  sector: string;
  overexposureWarning: boolean;
  message: string;
}

export interface Alert {
  id: string;
  watchlistId: string;
  userId: string;
  type: "PRICE_ABOVE" | "PRICE_BELOW" | "PCT_CHANGE_UP" | "PCT_CHANGE_DOWN" | "ENTRY_ZONE" | "SL_BREACHED";
  threshold: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistItem {
  symbol: string;
  currentPrice: number | null;
  changePercent: number | null;
  priceSinceAdded: number | null;
  targetEntryPrice: number | null;
  stopLoss: number | null;
  notes: string | null;
  entryZone: boolean | null;
  stopLossBreached: boolean | null;
  addedAt: string;
  aiSuggested: AiSuggested | null;
  portfolioFit: PortfolioFit | null;
  logo: string | null;
  alerts?: Alert[];
}
