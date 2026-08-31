import { getCache, setCache } from '../../shared/infrastructure/cache'
import { CACHE_TTL } from '../../shared/constants'
import { fetchYahooQuote, fetchYahooSector } from '../../shared/infrastructure/clients/yahoo-quote'
import fmpClient from '../../shared/infrastructure/clients/fmp-client'
import { logger } from '../../shared/infrastructure/logger'
import { getCompanyLogo } from './caches/logo-cache'
import {
    FmpMostActiveItem,
    RankedStockRow,
} from './types'

const CACHE_KEY = 'market:top-us-stocks'

export async function getRankedTopStocks(): Promise<RankedStockRow[]> {
  // Try Redis cache
  const cached = await getCache<RankedStockRow[]>(CACHE_KEY)
  if (cached) {
    return cached
  }

  // Fetch Most Actives from FMP (Stable Endpoint)
  const fmpRes = await fmpClient.get<FmpMostActiveItem[]>('/most-actives')
  const topSymbols = fmpRes.data
    .slice(0, 10)
    .map((stock) => stock.symbol || stock.ticker)
    .filter((symbol): symbol is string => Boolean(symbol))

  // Fetch Details from Yahoo Finance (Quote + Logo)
  const results: RankedStockRow[] = []
  for (let index = 0; index < topSymbols.length; index++) {
    const symbol = topSymbols[index]
    try {
      const quote = await fetchYahooQuote(symbol)

      // Use cached logo / profile fetch
      const logoUrl = (await getCompanyLogo(symbol)) || ''

      results.push({
        rank: index + 1,
        logoUrl,
        symbol,
        companyName: quote.name || symbol,
        price: quote.c,
        change: quote.d,
        changePercent: quote.dp,
        previousClose: quote.pc,
        high: quote.h,
        low: quote.l,
        open: quote.o,
        timestamp: quote.t,
      })
    } catch (err) {
      logger.error(`Failed to fetch full data for ${symbol}`, err)
    }
  }

  // Store in Redis
  if (results.length > 0) {
    await setCache(CACHE_KEY, results, CACHE_TTL.MARKET.TOP_STOCKS_QUOTE)
  }

  return results
}

export async function getLivePrices(
  symbols: string[],
): Promise<Record<string, number>> {
  const priceMap: Record<string, number> = {}

  for (const symbol of symbols) {
    try {
      const quote = await fetchYahooQuote(symbol)
      priceMap[symbol] = quote.c ?? 0
    } catch (error) {
      logger.error(`Failed to fetch price for ${symbol}`, error)
      priceMap[symbol] = 0
    }
  }

  return priceMap
}

export async function getCompanySectors(
  symbols: string[],
): Promise<Record<string, string>> {
  const sectorMap: Record<string, string> = {}

  for (const symbol of symbols) {
    try {
      const cached = await getCache<string>(`sector:${symbol}`)
      if (cached) {
        sectorMap[symbol] = cached
        continue
      }

      const sector = await fetchYahooSector(symbol)
      sectorMap[symbol] = sector

      await setCache(`sector:${symbol}`, sector, CACHE_TTL.MARKET.SECTOR_LOOKUP)
    } catch (error) {
      logger.error(`Failed to fetch sector for ${symbol}`, error)
      sectorMap[symbol] = 'Unknown'
    }
  }

  return sectorMap
}
