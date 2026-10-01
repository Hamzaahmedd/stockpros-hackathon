/** Finnhub `/quote` response shape; Yahoo quotes are normalised to it. */
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
