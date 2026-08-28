export interface Prediction {
  date: string;
  bull: number;
  base: number;
  bear: number;
}

export interface HistoricalPoint {
  date: string;
  price: number;
}

export interface ForecastData {
  symbol: string;
  period: string;
  currentPrice?: number;
  predictions: Prediction[];
  historicalData?: HistoricalPoint[];
  units?: string;
  status?: string;
  message?: string;
  estimated_ready_at?: number;
  targetRange?: {
    bull: number;
    base: number;
    bear: number;
    atr: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}
