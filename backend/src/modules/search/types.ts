export interface SymbolSearchResult {
  symbol: string
  description: string
  type: string
}

/** Shape of a single result item returned by the Finnhub search endpoint. */
export interface FinnhubSearchItem {
  symbol: string
  description: string
  type: string
}
