export interface StockData {
  logoUrl: string;
  symbol: string;
  companyName: string;
  price: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  timestamp: number;
}

export interface Trade {
  s: string;
  p: number;
  v: number;
  t?: number;
  snapshot?: boolean;
  updateCount?: number;
}
