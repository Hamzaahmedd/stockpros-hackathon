// Consolidated market service
import fmpClient from '../../shared/infrastructure/clients/fmp-client';
import finnhubClient from '../../shared/infrastructure/clients/finnhub-client';
import config from "../../shared/infrastructure/config/env";
import { RankedStockRow, StockQuote } from "./types";
import { getCache, setCache } from "../../shared/infrastructure/cache";

const FINNHUB_QUOTE_TTL = config.finnhub.quoteTTL;
const CACHE_KEY = "market:top-us-stocks";

export async function getRankedTopStocks(): Promise<RankedStockRow[]> {
  // Try Redis cache
  const cached = await getCache<RankedStockRow[]>(CACHE_KEY);
  if (cached) {
    return cached;
  }

  // Fetch Most Actives from FMP (Stable Endpoint)
  const fmpRes = await fmpClient.get<any[]>('/most-actives');
  const topSymbols = fmpRes.data.slice(0, 10).map(stock => stock.symbol || stock.ticker);

  // Fetch Details from Finnhub (Quote + Profile2)
  const results = await Promise.all(
    topSymbols.map(async (symbol, index) => {
      try {
        const [quoteRes, profileRes] = await Promise.all([
          finnhubClient.get<StockQuote>(`/quote`, { params: { symbol } }),
          finnhubClient.get<any>(`/stock/profile2`, { params: { symbol } })
        ]);

        const quote = quoteRes.data;
        const profile = profileRes.data;

        return {
          rank: index + 1,
          logoUrl: profile?.logo || '',
          symbol: symbol,
          companyName: profile?.name || symbol,
          price: quote.c,
          change: quote.d,
          changePercent: quote.dp,
          previousClose: quote.pc,
          high: quote.h,
          low: quote.l,
          open: quote.o,
          timestamp: quote.t,
        };
      } catch (err) {
        console.error(`Failed to fetch full data for ${symbol}`, err);
        return null;
      }
    })
  );

  const filteredResults = results.filter((r): r is RankedStockRow => r !== null);

  // Store in Redis
  if (filteredResults.length > 0) {
    await setCache(CACHE_KEY, filteredResults, FINNHUB_QUOTE_TTL);
  }

  return filteredResults;
}

export async function getLivePrices(
  symbols: string[],
): Promise<Record<string, number>> {
  const priceMap: Record<string, number> = {}

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const response = await finnhubClient.get<StockQuote>(`/quote`, {
          params: {
            symbol,
          },
        })

        const currentPrice = response.data?.c
        priceMap[symbol] = currentPrice
   
      } catch (error) {
        console.error(`Failed to fetch price for ${symbol}`)
        priceMap[symbol] = 0
      }
    }),
  )

  return priceMap
}

export async function getCompanySectors(
  symbols: string[],
): Promise<Record<string, string>> {
  const sectorMap: Record<string, string> = {}

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const cached = await getCache<string>(`sector:${symbol}`);
        if (cached) {
          sectorMap[symbol] = cached;
          return;
        }

        const response = await finnhubClient.get<any>(`/stock/profile2`, {
          params: {
            symbol,
          },
        })

        const sector = response.data?.finnhubIndustry ?? 'Unknown'
        sectorMap[symbol] = sector
        
        await setCache(`sector:${symbol}`, sector, 86400);
   
      } catch (error) {
        console.error(`Failed to fetch sector for ${symbol}`)
        sectorMap[symbol] = 'Unknown'
      }
    }),
  )

  return sectorMap
}
