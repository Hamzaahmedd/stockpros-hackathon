export interface SymbolSearchResult {
  symbol: string
  description: string
  type: string
}

export interface FinnhubSearchResponse {
  result?: SymbolSearchResult[]
}
