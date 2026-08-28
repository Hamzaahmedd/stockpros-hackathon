export interface FinnhubTrade {
  s: string // symbol
  p: number // price
  t: number // epoch ms
  v: number // volume
}

export interface FinnhubTradeMsg {
  type: string
  data?: FinnhubTrade[]
  msg?: string
}
