/**
 * Centralized Redis cache TTL constants, grouped by domain.
 *
 * Every TTL handed to `setCache` must come from this file — no inline
 * magic numbers in services, controllers, or repositories.  Values are
 * expressed in **seconds** through the named duration building blocks
 * below so each entry reads as a duration, not a number.
 *
 * Environment behavior is NOT configured here: the environment config
 * exposes a single `cache.ttlMultiplier` knob (1 in development and
 * production, 0 in test) that `setCache` applies to every TTL
 * centrally.  A multiplier of 0 disables expiring cache writes
 * entirely, so tests never stall on delayed cache expiration.
 */

const SECOND = 1
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

export const CACHE_TTL = {
  /** Live market data — short-lived snapshots of fast-moving quotes. */
  MARKET: {
    /** Ranked top-US-stocks quote snapshot (`market:top-us-stocks`). */
    TOP_STOCKS_QUOTE: 30 * SECOND,
    /** Company sector per symbol (`sector:{symbol}`) — rarely changes. */
    SYMBOL_SECTOR: 1 * DAY,
  },

  /** Symbol search — provider lookups are stable and rate-limited. */
  SEARCH: {
    /** Finnhub symbol lookup results (`search:{exchange}:{query}`). */
    SYMBOL_LOOKUP: 1 * DAY,
  },

  /** Decision-support analytics — recomputed hourly at most. */
  DECISION_SUPPORT: {
    /** Unified market decision payload per symbol. */
    MARKET_DECISION: 1 * HOUR,
    /** Historical closing prices (`hist_closes_{symbol}`). */
    HISTORICAL_CLOSES: 1 * HOUR,
  },

  /** Dashboard aggregates. */
  DASHBOARD: {
    /** Sector performance heatmap (`dashboard:sector-heatmap`). */
    SECTOR_HEATMAP: 1 * HOUR,
  },

  /** RBAC — kept short so permission changes propagate quickly. */
  ACCESS_CONTROL: {
    /** Effective permission snapshots (`user:{id}:*`). */
    PERMISSION_SNAPSHOT: 1 * MINUTE,
  },

  /** News feed and enrichment. */
  NEWS: {
    /** Paginated feed pages served to the frontend. */
    FEED_PAGE: 5 * MINUTE,
    /** Symbol → sector mapping used during article enrichment. */
    SYMBOL_SECTOR: 1 * WEEK,
  },
} as const

/** Union of every domain group in {@link CACHE_TTL}. */
export type CacheTtlDomain = keyof typeof CACHE_TTL
