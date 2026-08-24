export interface StockQuote {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
}

export interface RankedStockRow {
  rank: number;
  symbol: string;
  companyName: string;
  logoUrl: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  high: number;
  low: number;
  open: number;
  timestamp: number;
  sparkline?: number[];
}

export interface LogoCacheEntry {
  logo: string | null;
  timestamp: number;
}

export interface PriceCacheEntry {
  price: number;
  changePercent: number;
  volume: number;
  timestamp: number;
}
