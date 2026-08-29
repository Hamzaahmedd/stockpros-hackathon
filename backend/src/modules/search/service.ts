import { getCache, setCache } from '../../shared/infrastructure/cache'
import { CACHE_TTL } from '../../shared/constants'
import finnhubClient from '../../shared/infrastructure/clients/finnhub-client'
import { logger } from '../../shared/infrastructure/logger'
import { FinnhubSearchItem, SymbolSearchResult } from './types'

export async function searchSymbols(
  query: string,
  exchange: string = 'US',
): Promise<SymbolSearchResult[]> {
  // Normalize query to prevent duplicate cache entries for casing
  const normalizedQuery = query.toLowerCase().trim()
  const cacheKey = `search:${exchange}:${normalizedQuery}`

  try {
    const cachedResults = await getCache<SymbolSearchResult[]>(cacheKey)
    if (cachedResults) {
      logger.info(`[Cache Hit] Search results for: ${normalizedQuery}`)
      return cachedResults
    }

    const { data } = await finnhubClient.get(`/search`, {
      params: {
        q: query,
        exchange: exchange,
      },
    })

    if (!data || !data.result) return []

    const results: SymbolSearchResult[] = data.result.map((item: FinnhubSearchItem) => ({
      symbol: item.symbol,
      description: item.description,
      type: item.type,
    }))

    await setCache(cacheKey, results, CACHE_TTL.SEARCH.SYMBOL_LOOKUP) // 24 hours

    return results
  } catch (error) {
    logger.error(`Failed to search symbols for query ${query}`, error)
    return []
  }
}
