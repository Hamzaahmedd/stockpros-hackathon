// utils/downloadForecast.ts
// Client-side CSV export of the currently displayed forecast
// (summary + historical prices + model predictions).
import { ForecastData } from '../types';
import { calculateChange } from './forecastUtils';

const escapeCsv = (value: string | number): string => {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

// Mirrors the confidence shown in the on-screen Detailed Forecast table
const calculateConfidence = (index: number, total: number): number => {
  const baseConfidence = 90;
  const decay = (index / total) * 20;
  return Math.max(70, Math.round(baseConfidence - decay));
};

export const downloadForecastCsv = (data: ForecastData): void => {
  const rows: string[][] = [];

  // ── Summary header ─────────────────────────────────────────────────────────
  rows.push(['StockPros AI Price Forecast']);
  rows.push(['Symbol', data.symbol]);
  rows.push(['Period', data.period]);
  if (typeof data.currentPrice === 'number') {
    rows.push(['Current Price (USD)', data.currentPrice.toFixed(2)]);
  }
  if (typeof data.predictedChange === 'number') {
    rows.push(['Predicted Change (%)', data.predictedChange.toFixed(2)]);
  }
  if (typeof data.confidence === 'number') {
    rows.push(['Model Confidence (%)', String(data.confidence)]);
  }
  if (data.targetRange) {
    rows.push(['Target Range - Bull (USD)', data.targetRange.bull.toFixed(2)]);
    rows.push(['Target Range - Base (USD)', data.targetRange.base.toFixed(2)]);
    rows.push(['Target Range - Bear (USD)', data.targetRange.bear.toFixed(2)]);
    rows.push(['Target Range Confidence', data.targetRange.confidence]);
  }
  rows.push(['Generated At', new Date().toLocaleString()]);
  rows.push([]);

  // ── Data table (same rows as the on-screen Detailed Forecast table) ────────
  rows.push([
    'Date',
    'Type',
    'Base Price (USD)',
    'Bull Scenario (USD)',
    'Bear Scenario (USD)',
    'Change (%)',
    'Confidence (%)',
  ]);

  const combined: Array<{
    date: string;
    price: number;
    type: 'historical' | 'forecast';
    indexInType: number;
    bull?: number;
    bear?: number;
  }> = [];

  (data.historicalData || []).forEach((h, i) => {
    combined.push({ date: h.date, price: h.price, type: 'historical', indexInType: i });
  });

  (data.predictions || []).forEach((p, i) => {
    combined.push({ date: p.date, price: p.base, type: 'forecast', indexInType: i, bull: p.bull, bear: p.bear });
  });

  combined.forEach((item, index) => {
    const previousPrice = index > 0 ? combined[index - 1].price : null;
    const change = previousPrice !== null ? calculateChange(item.price, previousPrice) : 0;
    const confidence =
      item.type === 'historical' ? 100 : calculateConfidence(item.indexInType, data.predictions.length);

    rows.push([
      item.date,
      item.type === 'historical' ? 'Historical' : `Forecast Day ${item.indexInType + 1}`,
      item.price.toFixed(2),
      item.bull !== undefined ? item.bull.toFixed(2) : '',
      item.bear !== undefined ? item.bear.toFixed(2) : '',
      previousPrice !== null ? change.toFixed(2) : '',
      String(confidence),
    ]);
  });

  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `stockpros_forecast_${data.symbol}_${data.period}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
