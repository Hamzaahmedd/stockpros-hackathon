import { getCache, setCache } from '../../../shared/infrastructure/cache'
import finnhubClient from '../../../shared/infrastructure/clients/finnhub-client'
import { CACHE_TTL } from '../../../shared/constants'
import { logger } from '../../../shared/infrastructure/logger'

const LOGO_CACHE_TTL_SECONDS = Math.floor(CACHE_TTL.MARKET.LOGO_URL_MS / 1000) // 24 h
const LOGO_CACHE_PREFIX = 'market:logo:'

/**
 * Fetch a company logo URL from Finnhub and persist it in Redis.
 * Returns null if the API call fails or returns no logo.
 */
const fetchAndCacheLogo = async (symbol: string): Promise<string | null> => {
  try {
    const { data } = await finnhubClient.get<{ logo: string }>(
      '/stock/profile2',
      { params: { symbol } },
    )

    const logo = data.logo ?? null
    await setCache(`${LOGO_CACHE_PREFIX}${symbol}`, logo, LOGO_CACHE_TTL_SECONDS)
    return logo
  } catch (err) {
    logger.error(`[LogoCache] Failed to fetch logo for ${symbol}`, err)
    return null
  }
}

/**
 * Return the logo URL for a given symbol.
 * Reads from Redis first (24-hour TTL); falls back to a Finnhub REST call only
 * on a cache miss. This replaces the old in-memory Map that was lost on restart.
 */
export const getCompanyLogo = async (symbol: string): Promise<string | null> => {
  const cached = await getCache<string | null>(`${LOGO_CACHE_PREFIX}${symbol}`)

  if (cached !== null && cached !== undefined) {
    return cached
  }

  return fetchAndCacheLogo(symbol)
}
