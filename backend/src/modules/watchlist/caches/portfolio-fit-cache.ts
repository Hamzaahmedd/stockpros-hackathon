import { fetchYahooSector } from '../../../shared/infrastructure/clients/yahoo-quote'
import { prisma } from '../../../shared/infrastructure/database'
import { logger } from '../../../shared/infrastructure/logger'
import { getCurrentPrice } from '../../market'
import { CacheEntry, PortfolioFit } from '../types'
const OVEREXPOSURE_LIMIT = 0.3 // 30% single-sector limit per spec
const PRICE_DRIFT_THRESHOLD = 0.02 // recompute when price moves >2%

// ─── Cache ────────────────────────────────────────────────────────────────────

/**
 * Keyed by `${userId}:${symbol}`.
 * Single instance — replace with Redis when scaling horizontally.
 */
const portfolioFitCache = new Map<string, CacheEntry>()

// ─── Staleness Check ──────────────────────────────────────────────────────────

const isStale = (
  userId: string,
  symbol: string,
  currentPrice: number,
): boolean => {
  const cached = portfolioFitCache.get(`${userId}:${symbol}`)
  if (!cached) return true
  const drift = Math.abs(
    (currentPrice - cached.priceAtComputation) / cached.priceAtComputation,
  )
  return drift > PRICE_DRIFT_THRESHOLD
}

// ─── Yahoo Finance Profile ────────────────────────────────────────────────────

/**
 * Fetch the sector for a symbol via Yahoo Finance.
 * Returns 'Unknown' on failure so the rest of the computation still runs.
 */
const fetchSector = async (symbol: string): Promise<string> => {
  try {
    return await fetchYahooSector(symbol)
  } catch (err) {
    logger.error(`[PortfolioFit] Failed to fetch sector for ${symbol}`, err)
    return 'Unknown'
  }
}

// ─── Core Computation ─────────────────────────────────────────────────────────

/**
 * Computes portfolio fit for a watchlist symbol against the user's
 * current holdings.
 *
 * Steps:
 *   1. Load all the user's positions (across all portfolios)
 *   2. Fetch current prices for each held symbol
 *   3. Compute total portfolio value and per-sector value
 *   4. Fetch sector of the watchlist symbol
 *   5. Project new exposure using the average existing position value
 *      as the assumed investment amount (per spec decision)
 *   6. Flag overexposure if projected sector exposure > 30%
 */
const compute = async (
  userId: string,
  symbol: string,
  currentPrice: number,
): Promise<PortfolioFit> => {
  // ── 1. Load positions ──────────────────────────────────────────────────────
  const portfolios = await prisma.portfolio.findMany({
    where: { userId },
    include: { positions: true },
  })

  const positions = portfolios.flatMap((p) => p.positions)

  // ── 2. Fetch current prices for all held symbols ───────────────────────────
  const uniqueSymbols = [...new Set(positions.map((p) => p.symbol))]

  const priceMap = new Map<string, number>()
  await Promise.all(
    uniqueSymbols.map(async (sym) => {
      const priceData = await getCurrentPrice(sym)
      if (priceData) priceMap.set(sym, priceData.price)
    }),
  )

  // ── 3. Compute total portfolio value and per-sector breakdown ──────────────
  let totalPortfolioValue = 0
  const sectorValueMap = new Map<string, number>()

  for (const pos of positions) {
    const price = priceMap.get(pos.symbol) ?? pos.avgEntryPrice // fallback to entry
    const positionValue = pos.quantity * price
    totalPortfolioValue += positionValue

    const sector = pos.sector ?? 'Unknown'
    sectorValueMap.set(
      sector,
      (sectorValueMap.get(sector) ?? 0) + positionValue,
    )
  }

  // ── 4. Fetch sector of the watchlist symbol ────────────────────────────────
  const watchlistSector = await fetchSector(symbol)

  // ── 5. Project exposure ────────────────────────────────────────────────────
  // Assumed investment = average value of existing positions.
  // Falls back to currentPrice × 1 share when portfolio is empty.
  const averagePositionValue =
    positions.length > 0 ? totalPortfolioValue / positions.length : currentPrice

  const currentSectorValue = sectorValueMap.get(watchlistSector) ?? 0
  const projectedTotal = totalPortfolioValue + averagePositionValue
  const projectedSectorValue = currentSectorValue + averagePositionValue

  // Guard against division by zero (empty portfolio edge case)
  const currentExposure =
    totalPortfolioValue > 0 ? currentSectorValue / totalPortfolioValue : 0
  const projectedExposure =
    projectedTotal > 0 ? projectedSectorValue / projectedTotal : 0

  // ── 6. Overexposure flag ───────────────────────────────────────────────────
  const overexposureWarning = projectedExposure > OVEREXPOSURE_LIMIT

  const currentPct = Math.round(currentExposure * 100)
  const projectedPct = Math.round(projectedExposure * 100)
  const limitPct = Math.round(OVEREXPOSURE_LIMIT * 100)

  const message = overexposureWarning
    ? `Buying this will overexpose you to ${watchlistSector} (${projectedPct}% vs ${limitPct}% limit)`
    : `Adding this keeps your ${watchlistSector} exposure at ${projectedPct}%`

  return {
    currentSectorExposure: `${currentPct}%`,
    projectedSectorExposure: `${projectedPct}%`,
    sector: watchlistSector,
    overexposureWarning,
    message,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get portfolioFit for a symbol, served from cache.
 * Recomputes lazily only when price has drifted >2% since last computation.
 * Never recomputes on every GET (spec §8).
 */
export const getPortfolioFit = async (
  userId: string,
  symbol: string,
  currentPrice: number,
): Promise<PortfolioFit> => {
  if (!isStale(userId, symbol, currentPrice)) {
    return portfolioFitCache.get(`${userId}:${symbol}`)!.fit
  }

  const fit = await compute(userId, symbol, currentPrice)

  portfolioFitCache.set(`${userId}:${symbol}`, {
    fit,
    computedAt: Date.now(),
    priceAtComputation: currentPrice,
  })

  return fit
}

/**
 * Evict a single symbol entry from the cache.
 * Called when a symbol is removed from the watchlist or converted to a position.
 */
export const evictPortfolioFitEntry = (
  userId: string,
  symbol: string,
): void => {
  portfolioFitCache.delete(`${userId}:${symbol}`)
}

/**
 * Invalidate the entire cache for a user.
 * Called when any portfolio position is created, updated, or deleted —
 * since every symbol's projected exposure is now potentially stale.
 */
export const invalidateUserPortfolioFitCache = (userId: string): void => {
  for (const key of portfolioFitCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      portfolioFitCache.delete(key)
    }
  }
}
