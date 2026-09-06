export interface Prediction {
  date: string
  bull: number
  base: number
  bear: number
}

/** Raw prediction row returned by the ML service before enhancement. */
export interface MlRawPrediction {
  date: string
  price?: number
  predicted_close?: number
}

export interface HistoricalPoint {
  date: string
  close: number
}

export interface ForecastResponse {
  success: boolean
  message: string
  data: {
    symbol: string
    period: string
    predictions: Prediction[]
    historicalData: HistoricalPoint[]
    units: string
    targetRange?: {
      bull: number
      base: number
      bear: number
      atr: number
      confidence: 'HIGH' | 'MEDIUM' | 'LOW'
    }
    directionalBias?: {
      signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
      posture: 'ACCUMULATE' | 'DEFENSIVE' | 'HOLD'
      reasoning: string
      emaBaseline: number
      containmentRate: string
    }
    status?: string
    estimated_ready_at?: number
  }
}

export interface TechnicalBaselines {
  atr: number
  ema: number
  swingLow: number | null
  resistance: number | null
}

export interface ForecastDataPayload {
  symbol: string
  period: string
  currentPrice?: number
  predictions?: Array<{
    date: string
    base: number
    bull?: number
    bear?: number
  }>
  historicalData?: Array<{ date: string; close?: number; price?: number }>
  targetRange?: {
    bull: number
    base: number
    bear: number
    atr: number
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  }
  directionalBias?: {
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
    posture: 'ACCUMULATE' | 'DEFENSIVE' | 'HOLD'
    reasoning: string
    emaBaseline: number
    containmentRate: string
  }
  status?: string
  estimated_ready_at?: number
}
