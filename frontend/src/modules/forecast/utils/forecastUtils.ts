import { ForecastData } from '../types';

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

export const formatPercentage = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100);
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

export const calculateChange = (
  current: number, 
  previous: number | null
): number => {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
};

export const getChangeType = (change: number): 'positive' | 'negative' | 'neutral' => {
  if (change > 0.1) return 'positive';
  if (change < -0.1) return 'negative';
  return 'neutral';
};

export const calculateAveragePrice = (predictions: Array<{base: number}>): number => {
  if (!predictions || predictions.length === 0) return 0;
  const sum = predictions.reduce((total, pred) => total + pred.base, 0);
  return sum / predictions.length;
};

export const calculatePredictionRange = (
  predictions: Array<{base: number}>
): { min: number; max: number } => {
  if (!predictions || predictions.length === 0) {
    return { min: 0, max: 0 };
  }
  
  const prices = predictions.map(p => p.base);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices)
  };
};

export const getTrendDirection = (data: ForecastData): 'up' | 'down' | 'sideways' => {
  if (!data.predictions || data.predictions.length < 2) return 'sideways';
  
  const first = data.predictions[0].base;
  const last = data.predictions[data.predictions.length - 1].base;
  const change = ((last - first) / first) * 100;
  
  if (change > 2) return 'up';
  if (change < -2) return 'down';
  return 'sideways';
};