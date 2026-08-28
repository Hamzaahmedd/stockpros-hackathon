import finnhubClient from '../../shared/infrastructure/clients/finnhub-client';
import { FinnhubSearchResponse, SymbolSearchResult } from "./types";
import { getCache, setCache } from "../../shared/infrastructure/cache";

export async function searchSymbols(
  query: string,
  exchange: string = 'US'
): Promise<SymbolSearchResult[]> {
  // Normalize query to prevent duplicate cache entries for casing
  const normalizedQuery = query.toLowerCase().trim();
  const cacheKey = `search:${exchange}:${normalizedQuery}`;

  try {
    const cachedResults = await getCache<SymbolSearchResult[]>(cacheKey);
    if (cachedResults) {
      console.log(`[Cache Hit] Search results for: ${normalizedQuery}`);
      return cachedResults;
    }

    const { data } = await finnhubClient.get<FinnhubSearchResponse>(`/search`, {
      params: {
        q: query,
        exchange: exchange,
      },
    });

    if (!data || !data.result) return [];

    const results: SymbolSearchResult[] = data.result.map((item) => ({
      symbol: item.symbol,
      description: item.description,
      type: item.type,
    }));

    await setCache(cacheKey, results, 86400); // 24 hours

    return results;
  } catch (error) {
    console.error(`Failed to search symbols for query ${query}:`, error);
    return [];
  }
}