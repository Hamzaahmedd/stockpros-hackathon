import YahooFinance from 'yahoo-finance2'
import { StockQuote } from '../../../modules/market/types'

// Single shared instance — suppresses the survey notice
const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

/**
 * Fetch a stock quote from Yahoo Finance and map it to the
 * same StockQuote shape used by the Finnhub REST client.
 *
 * Fields mapped:
 *   c  = regularMarketPrice   (current price)
 *   d  = regularMarketChange  (absolute change)
 *   dp = regularMarketChangePercent
 *   h  = regularMarketDayHigh
 *   l  = regularMarketDayLow
 *   o  = regularMarketOpen
 *   pc = regularMarketPreviousClose
 *   t  = unix timestamp (seconds)
 *   v  = regularMarketVolume
 */
export async function fetchYahooQuote(symbol: string): Promise<StockQuote & { v: number; name?: string }> {
  const q = await yahoo.quote(symbol)

  return {
    c: q.regularMarketPrice ?? 0,
    d: q.regularMarketChange ?? 0,
    dp: q.regularMarketChangePercent ?? 0,
    h: q.regularMarketDayHigh ?? 0,
    l: q.regularMarketDayLow ?? 0,
    o: q.regularMarketOpen ?? 0,
    pc: q.regularMarketPreviousClose ?? 0,
    t: Math.floor(Date.now() / 1000),
    v: q.regularMarketVolume ?? 0,
    name: q.shortName || q.longName || symbol,
  }
}

/**
 * Fetch the sector/industry for a symbol from Yahoo Finance.
 * Returns 'Unknown' if the lookup fails.
 */
export async function fetchYahooSector(symbol: string): Promise<string> {
  try {
    const summary = await yahoo.quoteSummary(symbol, { modules: ['assetProfile'] })
    return summary.assetProfile?.industry ?? 'Unknown'
  } catch {
    return 'Unknown'
  }
}

/**
 * Fetch the company logo URL for a symbol.
 * Yahoo Finance does not expose logos directly, so we use the
 * free Clearbit Logo API (no key required) as a fallback.
 */
export async function fetchYahooCompanyLogo(symbol: string): Promise<string | null> {
  try {
    const summary = await yahoo.quoteSummary(symbol, { modules: ['assetProfile'] })
    const website = summary.assetProfile?.website
    if (website) {
      try {
        const domain = new URL(website).hostname.replace(/^www\./, '')
        return `https://logo.clearbit.com/${domain}`
      } catch {
        // fallback below
      }
    }
    return null
  } catch {
    return null
  }
}
