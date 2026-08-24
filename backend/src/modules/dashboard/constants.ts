export const DASHBOARD_SECTOR_CACHE_KEY     = 'dashboard:sector-heatmap'
export const DASHBOARD_SECTOR_CACHE_TTL     = 60 * 60  // 60 minutes
export const DASHBOARD_IMPACT_NEWS_HOURS    = 48
export const DASHBOARD_SMART_TRIGGER_LIMIT  = 10
export const DASHBOARD_IMPACT_NEWS_LIMIT    = 5
export const OVEREXPOSURE_THRESHOLD         = 30   // % — matches watchlist spec
export const HEALTH_SCORE_WEIGHTS = {
  diversification:      0.25,
  riskReward:           0.25,
  volatility:           0.20,
  alertHealth:          0.15,
  watchlistDiscipline:  0.15,
} as const