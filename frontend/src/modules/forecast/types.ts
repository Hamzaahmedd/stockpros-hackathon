// types/forecast.ts
export interface ForecastPrediction {
  date: string;
  base: number;
  bull?: number;
  bear?: number;
}

export interface HistoricalDataPoint {
  date: string;
  price: number;
}

export interface ForecastData {
  symbol: string;
  period: string;
  status?: 'training' | 'success' | 'error';
  message?: string;
  estimated_ready_at?: number;
  predictions: ForecastPrediction[];
  historicalData?: HistoricalDataPoint[];
  currentPrice?: number;
  units?: string;
  predictedChange?: number;
  confidence?: number;
  insights?: ForecastInsight[];
  targetRange?: {
    bull: number;
    base: number;
    bear: number;
    atr: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  directionalBias?: {
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    posture: 'ACCUMULATE' | 'DEFENSIVE' | 'HOLD';
    reasoning: string;
    emaBaseline: number;
    containmentRate: string;
  };
}

export interface ForecastResponse {
  success: boolean;
  message: string;
  data: ForecastData;
}

export interface ForecastInsight {
  type: 'bullish' | 'bearish' | 'neutral' | 'warning' | 'info';
  title: string;
  description: string;
  icon: string;
}

export interface PeriodOption {
  value: string;
  label: string;
  icon: React.ReactNode;
}

export interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType: 'positive' | 'negative' | 'neutral';
  icon: React.ReactNode;
}

export interface ChartDataPoint {
  date: string;
  price: number;
  type: 'historical' | 'current' | 'forecast';
}

export interface IndicatorCardProps {
  title: string;
  value: string | number;
  status: 'bullish' | 'bearish' | 'neutral' | 'warning' | 'info';
  description: string;
  range?: string;
}
