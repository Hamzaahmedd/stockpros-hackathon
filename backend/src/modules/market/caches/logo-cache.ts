import { fetchYahooCompanyLogo } from '@/shared/infrastructure/clients/yahoo-quote'
import { logger } from '../../../shared/infrastructure/logger'
import { LogoCacheEntry } from '../types'
import { CACHE_TTL } from '../../../shared/constants'

const LOGO_CACHE_TTL_MS = CACHE_TTL.MARKET.LOGO_URL_MS // 24 hours

export const logoCache = new Map<string, LogoCacheEntry>()

export const fetchAndCacheLogo = async (
  symbol: string,
): Promise<string | null> => {
  try {
    const logo = await fetchYahooCompanyLogo(symbol)
    logoCache.set(symbol, {
      logo,
      timestamp: Date.now(),
    })
    return logo
  } catch (err) {
    logger.error(`[LogoCache] Failed to fetch logo for ${symbol}`, err)
    return null
  }
}

export const getCompanyLogo = async (
  symbol: string,
): Promise<string | null> => {
  const cached = logoCache.get(symbol)

  if (cached && Date.now() - cached.timestamp < LOGO_CACHE_TTL_MS) {
    return cached.logo
  }

  return await fetchAndCacheLogo(symbol)
}
