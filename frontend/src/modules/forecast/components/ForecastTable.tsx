// components/ForecastTable.tsx - Card Design
import React from 'react';
import { ForecastData } from '../types';
import { TrendingUp, TrendingDown, Calendar, DollarSign, BarChart3, Activity } from 'lucide-react';

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

  const formatCurrency = (value: number): string => {
    return `$${value.toFixed(2)}`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
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

  const combinedData: Array<{ date: string; price: number; type: 'historical' | 'forecast'; indexInType: number }> = [];
  
  if (data.historicalData && data.historicalData.length > 0) {
    data.historicalData.forEach((h, i) => {
      combinedData.push({
        date: h.date,
        price: h.price,
        type: 'historical',
        indexInType: i,
      });
    });
  }
  
  if (data.predictions && data.predictions.length > 0) {
    data.predictions.forEach((p, i) => {
      combinedData.push({
        date: p.date,
        price: p.base,
        type: 'forecast',
        indexInType: i,
      });
    });
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      {combinedData.map((item, index) => {
        const previousPrice = index > 0 ? combinedData[index - 1].price : null;
        const change = calculateChange(item.price, previousPrice);
        const isHistorical = item.type === 'historical';
        const confidence = isHistorical ? 100 : calculateConfidence(item.indexInType, data.predictions.length);
        const isPositive = change >= 0;
        const isHighConfidence = confidence >= 80;
        const isMediumConfidence = confidence >= 70 && confidence < 80;

        return (
          <div
            key={`${item.date}-${index}`}
            className={`border rounded-xl p-4 transition-all hover:scale-[1.005] ${
              isHistorical
                ? 'bg-blue-900/10 hover:bg-blue-900/20 border-blue-500/20 hover:border-blue-500/40'
                : 'bg-[#1A1F2E] hover:bg-[#1a1a1a] border-cyan-500/20 hover:border-cyan-500/40'
            }`}
          >
            <div className="flex items-center justify-between">
              {/* Date & Icon */}
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isHistorical ? 'bg-blue-500/20' : 'bg-cyan-500/20'
                }`}>
                  <Calendar size={16} className={isHistorical ? 'text-blue-400' : 'text-cyan-400'} />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">
                    {formatDate(item.date)}
                  </div>
                  <div className={`text-xs mt-0.5 ${isHistorical ? 'text-blue-300' : 'text-cyan-300'}`}>
                    {isHistorical ? 'Historical' : `Forecast Day ${item.indexInType + 1}`}
                  </div>
                </div>
              </div>

              {/* Price */}
              <div className="text-right">
                <div className="flex items-center justify-end gap-2 text-sm font-medium text-white">
                  <DollarSign size={14} className="text-gray-400" />
                  {formatCurrency(item.price)}
                </div>
                {previousPrice !== null && (
                  <div className={`text-xs mt-1 ${
                    isPositive ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {isPositive ? '+' : ''}{change.toFixed(2)}%
                  </div>
                )}
              </div>
            </div>

            {/* Confidence Bar */}
            {!isHistorical && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>Model Confidence</span>
                  <span className={`font-medium ${
                    isHighConfidence 
                      ? 'text-cyan-400' 
                      : isMediumConfidence
                      ? 'text-yellow-400' 
                      : 'text-red-400'
                  }`}>
                    {confidence}%
                  </span>
                </div>
                <div className="h-1.5 bg-[#0a0a0a] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      isHighConfidence 
                        ? 'bg-cyan-500' // Changed to cyan to match forecast color
                        : isMediumConfidence
                        ? 'bg-yellow-500' 
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${confidence}%` }}
                  />
                </div>
              </div>
            )}

            {/* Trend Indicator */}
            {previousPrice !== null && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                <div className={`flex items-center gap-1.5 text-xs ${
                  isPositive ? 'text-green-400' : 'text-red-400'
                }`}>
                  {isPositive ? (
                    <TrendingUp size={12} />
                  ) : (
                    <TrendingDown size={12} />
                  )}
                  <span>{isPositive ? 'Bullish' : 'Bearish'} trend</span>
                </div>
                <div className="text-xs text-gray-400">
                  vs previous day
                </div>
              </div>
            )}
          </div>
        );
      }).reverse()}

      {/* Summary Footer */}
      <div className="mt-4 p-3 bg-[#1A1F2E] border border-white/5 rounded-xl">
        <div className="flex items-center justify-between text-xs">
          <div className="text-gray-400">
            <span className="font-medium text-gray-300">{data.predictions.length}</span> predictions generated
          </div>
          <div className="flex items-center gap-4 text-gray-500">
            <span className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600/20"></div>
              <span>High confidence</span>
            </span>
            <span className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/20"></div>
              <span>Medium confidence</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForecastTable;