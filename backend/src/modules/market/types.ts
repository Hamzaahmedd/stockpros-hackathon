export interface StockQuote {
  c: number
  d: number
  dp: number
  h: number
  l: number
  o: number
  pc: number
  t: number
}

export interface RankedStockRow {
  rank: number
  symbol: string
  companyName: string
  logoUrl: string
  price: number
  change: number
  changePercent: number
  previousClose: number
  high: number
  low: number
  open: number
  timestamp: number
  sparkline?: number[]
}

export interface LogoCacheEntry {
  logo: string | null
  timestamp: number
}

export interface PriceCacheEntry {
  price: number
  changePercent: number
  volume: number
  timestamp: number
}

/** Company profile returned by the Finnhub /stock/profile2 endpoint. */
export interface FinnhubProfile {
  name?: string
  logo?: string
  finnhubIndustry?: string
}

/** Item returned by the FMP /most-actives endpoint. */
export interface FmpMostActiveItem {
  symbol?: string
  ticker?: string
}
