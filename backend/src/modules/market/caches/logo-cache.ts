import finnhubClient from '@/shared/infrastructure/clients/finnhub-client'
import { logger } from '../../../shared/infrastructure/logger'
import { LogoCacheEntry } from '../types'

const LOGO_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export const logoCache = new Map<string, LogoCacheEntry>()

export const fetchAndCacheLogo = async (
  symbol: string,
): Promise<string | null> => {
  try {
    const { data } = await finnhubClient.get<{
      logo: string
    }>(`/stock/profile2`, {
      params: { symbol },
    })

    const logo = data.logo || null
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
