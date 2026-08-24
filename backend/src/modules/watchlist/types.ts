import type { AiConfidence } from '@prisma/client'

export interface WatchlistItemResponse {
  symbol: string
  currentPrice: number | null
  changePercent: number | null
  priceSinceAdded: number | null
  targetEntryPrice: number | null
  stopLoss: number | null
  notes: string | null
  entryZone: boolean | null
  stopLossBreached: boolean | null
  aiSuggested: {
    entry: number
    takeProfit: number
    stopLoss: number
    confidence: 'LOW' | 'MEDIUM' | 'HIGH'
    basis: string
    computedAt: string
  } | null
  portfolioFit: PortfolioFit | null
  addedAt: Date
  logo: string | null
  alerts?: {
    id: string
    type: string
    threshold: number | null
    isActive: boolean
  }[]
}

export interface PortfolioFit {
  currentSectorExposure: string // e.g. "24%"
  projectedSectorExposure: string // e.g. "31%"
  sector: string // e.g. "Technology"
  overexposureWarning: boolean
  message: string
}

export interface CacheEntry {
  fit: PortfolioFit
  computedAt: number // ms epoch
  priceAtComputation: number // used to detect >2% drift
}

export interface Candle {
  datetime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface AiZones {
  entry: number
  stopLoss: number
  takeProfit: number
  confidence: AiConfidence
  basis: string
}

export interface TechnicalBaselines {
  atr: number
  ema: number
  swingLow: number | null
  resistance: number | null
  currentPrice: number
}

export interface WatchlistPriceLevels {
  targetEntryPrice: number | null
  stopLoss: number | null
}
