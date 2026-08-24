import { RankedStockRow } from '../market'

export type SectorSignal =
  | 'OVEREXPOSED'
  | 'BLIND_SPOT'
  | 'WELL_POSITIONED'
  | 'UNDERPERFORMING'
  | 'NEUTRAL'
  | 'NO_EXPOSURE'

export type SmartTriggerType =
  | 'STOP_LOSS_BREACHED'
  | 'EARNINGS_APPROACHING'
  | 'ENTRY_ZONE'
  | 'DIVIDEND_APPROACHING'
  | 'ANALYST_RATING_CHANGE'
  | 'AI_SIGNAL_CHANGED'
  | 'PCT_CHANGE_UP'
  | 'PCT_CHANGE_DOWN'

export type TriggerUrgency = 'HIGH' | 'MEDIUM' | 'LOW'

export type ImpactType =
  | 'NEGATIVE_HOLDING'
  | 'POSITIVE_HOLDING'
  | 'NEGATIVE_WATCHLIST'
  | 'POSITIVE_WATCHLIST'

export interface HealthScoreBreakdown {
  diversification:     number
  riskReward:          number
  volatility:          number
  alertHealth:         number
  watchlistDiscipline: number
}

export interface HealthScore {
  score:     number
  band:      'Excellent' | 'Good' | 'Fair' | 'Poor'
  label:     string
  breakdown: HealthScoreBreakdown
}

export interface SectorHeatmapItem {
  name:             string
  performance:      { '1d': number; '5d': number; '1m': number }
  userExposurePct:  number
  userSymbols:      string[]
  signal:           SectorSignal
}

export interface SmartTrigger {
  type:    SmartTriggerType
  symbol:  string
  urgency: TriggerUrgency
  message: string
  context: string
  action:  string
}

export interface ImpactNewsItem {
  id:          string
  headline:    string
  sentiment:   'BULLISH' | 'BEARISH' | 'NEUTRAL'
  symbol:      string
  impact:      ImpactType
  sharesHeld:  number | null
  publishedAt: Date
  source:      string
  url:         string
}

export interface DashboardBriefing {
  greeting:  string
  generatedAt: string
  decisionSupport: {
    available: boolean
    reason:    string | null
    summary: {
      buySignals:      number
      holdSignals:     number
      trimSignals:     number
      positionsAtRisk: number
      lastRunAt:       Date
    } | null
    headline: string | null
  }
  portfolioAlert: {
    overexposedSectors: string[]
    stopLossBreaches:   number
    entryZonesActive:   number
    headline:           string
  } | null
}

export interface DashboardPortfolio {
  available:              boolean
  reason?:                string
  totalValue?:            number
  totalUnrealizedPnL?:    number
  totalUnrealizedPnLPct?: number
  todayGainLoss?:         number
  todayGainLossPct?:      number
  bestPerformer?:         { symbol: string; changePercent: number } | null
  worstPerformer?:        { symbol: string; changePercent: number } | null
  healthScore?:           HealthScore
}

export interface DashboardResponse {
  briefing:        DashboardBriefing
  portfolio:       DashboardPortfolio
  impactNews:      { items: ImpactNewsItem[]; totalCount: number }
  smartTriggers:   { items: SmartTrigger[];   totalCount: number }
  sectorHeatmap:   { cachedAt: string; sectors: SectorHeatmapItem[] }
  trendingStocks:  RankedStockRow[]
}