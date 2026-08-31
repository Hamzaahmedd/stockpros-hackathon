/**
 * Centralized Redis and In-Memory Cache Time-To-Live (TTL) Constants.
 *
 * Grouped strictly by business domain using human-readable time arithmetic expressions.
 * All TTL values are represented in seconds unless explicitly suffixed with _MS (milliseconds).
 */
export const CACHE_TTL = {
  /** Authentication & Role-Based Access Control (RBAC) */
  AUTH: {
    USER_PERMISSIONS: 60, // 1 minute
    ROLE_PERMISSIONS: 60, // 1 minute
    SCREEN_ACTIONS: 60, // 1 minute
    SESSION_TOKEN: 60 * 60 * 24 * 7, // 7 days (604,800 seconds)
  },

  /** Real-Time Market Data, Quotes, and Asset Metadata */
  MARKET: {
    TOP_STOCKS_QUOTE: 120, // 2 minutes
    REST_PRICE_MS: 60 * 1000, // 60,000 milliseconds (1 minute in-memory fallback)
    LOGO_URL_MS: 24 * 60 * 60 * 1000, // 24 hours in-memory
    SECTOR_LOOKUP: 60 * 60 * 24, // 24 hours (86,400 seconds)
  },

  /** News Aggregation, Sentiment Scoring, and Category Mappings */
  NEWS: {
    FEED_SUMMARY: 5 * 60, // 5 minutes (300 seconds)
    SECTOR_METADATA: 60 * 60 * 24 * 7, // 7 days (604,800 seconds)
  },

  /** AI Decision Support & Trader Portfolio Analytics */
  DECISION_SUPPORT: {
    TRADE_DECISION: 60 * 60, // 1 hour (3,600 seconds)
    HISTORICAL_CLOSES: 60 * 60, // 1 hour (3,600 seconds)
    RADAR: 4 * 60 * 60, // 4 hours (14,400 seconds)
    ATR: 60 * 60, // 1 hour (3,600 seconds)
    PORTFOLIO_BETAS: 4 * 60 * 60, // 4 hours (14,400 seconds)
  },

  /** Consolidated User Dashboard Metrics & Aggregations */
  DASHBOARD: {
    SECTOR_SUMMARY: 60 * 60, // 1 hour (3,600 seconds)
  },

  /** Symbol Lookup & Autocomplete Search */
  SEARCH: {
    SYMBOL_LOOKUP: 60 * 60 * 24, // 24 hours (86,400 seconds)
  },
} as const

export type CacheDomain = keyof typeof CACHE_TTL
