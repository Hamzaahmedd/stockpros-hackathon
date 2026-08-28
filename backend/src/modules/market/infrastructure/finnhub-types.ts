export interface FinnhubTrade {
  s: string; // symbol
  p: number; // price
  t: number; // epoch ms
  v: number; // volume
}

export interface FinnhubTradeMsg {
  type: string;
  data?: FinnhubTrade[];
  msg?: string;
}

export interface FinnhubQuote {
  c: number;  // current price
  d: number;  // change
  dp: number; // percent change
  h: number;  // day high
  l: number;  // day low
  o: number;  // day open
  pc: number; // previous close
  t: number;  // timestamp
}