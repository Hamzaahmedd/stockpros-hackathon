export interface Prediction {
  date: string;
  bull: number;
  base: number;
  bear: number;
}

export interface HistoricalPoint {
  date: string;
  close: number;
}

export interface ForecastResponse {
  success: boolean;
  message: string;
  data: {
    symbol: string;
    period: string;
    predictions: Prediction[];
    historicalData: HistoricalPoint[];
    units: string;
    targetRange?: {
      bull: number;
      base: number;
      bear: number;
      atr: number;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    };
    status?: string;
    estimated_ready_at?: number;
  };
}