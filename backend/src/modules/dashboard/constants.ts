import { CACHE_TTL } from '../../shared/constants'

export const DASHBOARD_SECTOR_CACHE_KEY = 'dashboard:sector-heatmap'
export const DASHBOARD_SECTOR_CACHE_TTL = CACHE_TTL.DASHBOARD.SECTOR_SUMMARY
export const DASHBOARD_IMPACT_NEWS_HOURS = 48
export const DASHBOARD_SMART_TRIGGER_LIMIT = 10
export const DASHBOARD_IMPACT_NEWS_LIMIT = 5
export const OVEREXPOSURE_THRESHOLD = 30 // % — matches watchlist spec

/**
 * How long (ms) fetched watchlist prices are considered fresh within a single
 * dashboard request. Prevents the same symbol being hit 3× across
 * buildBriefing / computeHealthScore / buildSmartTriggers.
 */
export const DASHBOARD_WATCHLIST_PRICE_CACHE_TTL_MS = 30 * 1000 // 30 seconds

export const HEALTH_SCORE_WEIGHTS = {
  diversification: 0.25,
  riskReward: 0.25,
  volatility: 0.2,
  alertHealth: 0.15,
  watchlistDiscipline: 0.15,
} as const
