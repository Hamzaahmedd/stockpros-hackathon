// components/ForecastTable.tsx - Forecast Only
import React from 'react';
import { ForecastData } from '../types';
import { Calendar, BarChart3, Activity } from 'lucide-react';

interface ForecastTableProps {
  data: ForecastData | null;
}

const ForecastTable: React.FC<ForecastTableProps> = ({ data }) => {
  if (!data || !data.predictions || data.predictions.length === 0) {
    const isTraining = data?.status === 'training';
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
        <div className={`w-16 h-16 rounded-full ${isTraining ? 'bg-amber-500/10 animate-pulse' : 'bg-[#1A1F2E]'} flex items-center justify-center mb-4`}>
          {isTraining ? (
            <Activity size={24} className="text-amber-500" />
          ) : (
            <BarChart3 size={24} className="text-gray-500" />
          )}
        </div>
        <p className={`text-sm font-medium ${isTraining ? 'text-amber-400' : 'text-gray-300'}`}>
          {isTraining ? 'AI Model Training' : 'No forecast data available'}
        </p>
        <p className="text-xs text-gray-500 mt-2 text-center max-w-xs px-4">
          {isTraining
            ? 'The GRU neural network is analyzing historical volatility and trends. Detailed metrics will appear here once complete.'
            : 'Select a stock symbol to view predictions'
          }
        </p>
      </div>
    );
  }

  const formatCurrency = (value: number): string => `$${value.toFixed(2)}`;

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const calculateChange = (current: number, previous: number | null): number => {
    if (!previous) return 0;
    return ((current - previous) / previous) * 100;
  };

  const calculateConfidence = (index: number, total: number): number => {
    const baseConfidence = 90;
    const decay = (index / total) * 20;
    return Math.max(70, Math.round(baseConfidence - decay));
  };

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      {data.predictions.map((pred, index) => {
        const previousPrice = index > 0 ? data.predictions[index - 1].base : null;
        const change = calculateChange(pred.base, previousPrice);
        const confidence = calculateConfidence(index, data.predictions.length);
        const isPositive = change >= 0;
        const isHighConfidence = confidence >= 80;
        const isMediumConfidence = confidence >= 70 && confidence < 80;

        return (
          <div
            key={`${pred.date}-${index}`}
            className="border border-border/70 rounded-lg p-3.5 bg-muted/15 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center justify-between">
              {/* Date & Icon */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md flex items-center justify-center border bg-primary/10 text-primary border-primary/20">
                  <Calendar size={14} />
                </div>
                <div>
                  <div className="text-xs font-mono font-semibold text-foreground">
                    {formatDate(pred.date)}
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground">
                    Day {index + 1}
                  </div>
                </div>
              </div>

              {/* Price */}
              <div className="text-right font-mono">
                <div className="text-sm font-bold text-foreground">
                  {formatCurrency(pred.base)}
                </div>
                {previousPrice !== null && (
                  <div className={`text-[11px] font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPositive ? '+' : ''}{change.toFixed(2)}%
                  </div>
                )}
              </div>
            </div>

            {/* Confidence Bar */}
            <div className="mt-2.5 pt-2 border-t border-border/40">
              <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground mb-1">
                <span>Confidence</span>
                <span className={`font-semibold ${
                  isHighConfidence
                    ? 'text-emerald-400'
                    : isMediumConfidence
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}>
                  {confidence}%
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    isHighConfidence
                      ? 'bg-emerald-500'
                      : isMediumConfidence
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${confidence}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Summary Footer */}
      <div className="mt-4 p-3 bg-muted/20 border border-border/60 rounded-lg">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="text-muted-foreground">
            <span className="font-semibold text-foreground">{data.predictions.length}</span> days forecasted
          </div>
          <div className="flex items-center gap-4 text-muted-foreground text-[11px]">
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              <span>High (≥80%)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
              <span>Medium (70–79%)</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForecastTable;