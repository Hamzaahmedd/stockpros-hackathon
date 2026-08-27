// components/ForecastChart.tsx
import React from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  TooltipProps
} from 'recharts';
import { ForecastData } from '../types';
import { TrendingUp, Calendar, DollarSign, Eye, LineChart as LineChartIcon } from 'lucide-react';

interface ForecastChartProps {
  data: ForecastData | null;
  period: string;
}

interface ChartDataPoint {
  date: string;
  price: number;
  type: 'historical' | 'forecast';
}

const ForecastChart: React.FC<ForecastChartProps> = ({ data, period }) => {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
    }
  }, [data, period]);
  if (!data || !data.predictions || data.predictions.length === 0) {
    const isTraining = data?.status === 'training';
    return (
      <div className="h-80 flex flex-col items-center justify-center text-gray-400">
        <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${isTraining ? 'from-amber-500/20 to-orange-500/20 animate-pulse' : 'from-slate-800 to-slate-900'} flex items-center justify-center mb-4 border border-white/5`}>
          {isTraining ? (
            <div className="relative">
              <TrendingUp size={24} className="text-amber-500" />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full animate-ping"></div>
            </div>
          ) : (
            <LineChartIcon size={24} className="text-gray-500" />
          )}
        </div>
        <p className={`text-sm font-medium ${isTraining ? 'text-amber-400' : 'text-gray-300'}`}>
          {isTraining ? 'AI Model Training in Progress' : 'No forecast data available'}
        </p>
        <p className="text-xs text-gray-500 mt-2 max-w-xs text-center px-4">
          {isTraining 
            ? (data.message || 'The AI is learning historical patterns for this symbol. This usually takes about 2 minutes.')
            : 'Select a stock symbol to view predictions'
          }
        </p>
        {isTraining && (
          <div className="mt-6 flex items-center gap-2">
            <div className="h-1.5 w-24 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 animate-training-progress"></div>
            </div>
          </div>
        )}
      </div>
    );
  }

  let chartData: any[] = [];

  if (data.historicalData && data.historicalData.length > 0) {
    data.historicalData.forEach((h: any) => {
      chartData.push({
        date: h.date,
        historicalPrice: h.price,
        forecastPrice: null,
        bull: null,
        bear: null,
        type: 'historical'
      });
    });
  }

  // Create connection point to avoid gaps in chart
  if (chartData.length > 0) {
    chartData[chartData.length - 1].forecastPrice = chartData[chartData.length - 1].historicalPrice;
  }

  data.predictions.forEach((pred, idx) => {
    chartData.push({
      date: pred.date,
      historicalPrice: null,
      forecastPrice: pred.base,
      bull: pred.bull || null,
      bear: pred.bear || null,
      type: 'forecast',
      isCurrentPrice: idx === 0
    });
  });

  // Calculate min and max for Y-axis with padding
  const allPrices = chartData.flatMap(d => [d.historicalPrice, d.forecastPrice, d.bull, d.bear]).filter((p): p is number => p !== null && p !== undefined);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const pricePadding = (maxPrice - minPrice) * 0.1;

  const formatDate = (date: string): string => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Karachi'
    });
  };

  const getPeriodLabel = (period: string): string => {
    switch (period) {
      case '1d': return '1 Day Forecast';
      case '1w': return '1 Week Forecast';
      default: return 'Forecast';
    }
  };

  const CustomTooltip: React.FC<TooltipProps<number, string>> = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      const isForecast = dataPoint.type === 'forecast';
      const displayValue = dataPoint.forecastPrice !== null && dataPoint.historicalPrice === null
        ? dataPoint.forecastPrice 
        : (dataPoint.historicalPrice || dataPoint.forecastPrice);
      
      const date = new Date(label);
      const fullDate = date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      return (
        <div className="bg-[#1A1F2E] p-4 border border-white/10 rounded-xl shadow-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={14} className="text-[#22d3ee]" />
            <p className="text-sm font-medium text-white">{fullDate}</p>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isForecast ? 'bg-[#22d3ee]' : 'bg-[#64748b]'}`}></div>
                <span className="text-xs text-gray-400">
                 {isForecast ? (dataPoint.isCurrentPrice ? 'Current Price' : 'AI Forecast') : 'Historical'}                </span>
              </div>
              <span className="text-sm font-semibold text-white ml-4">
                ${displayValue?.toFixed(2)}
              </span>
            </div>
            
            {isForecast && dataPoint.bull !== null && dataPoint.bear !== null && (
              <div className="pt-2 mt-2 border-t border-white/5 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#10b981]"></div>
                    <span className="text-gray-400">Bull Target</span>
                  </div>
                  <span className="text-white ml-4">${dataPoint.bull?.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#ef4444]"></div>
                    <span className="text-gray-400">Bear Target</span>
                  </div>
                  <span className="text-white ml-4">${dataPoint.bear?.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const yAxisProps = {
    stroke: "#9CA3AF",
    domain: [minPrice - pricePadding, maxPrice + pricePadding],
    tickFormatter: (value: number) => `$${value.toFixed(2)}`,
    fontSize: 11,
    tick: { fill: '#9CA3AF' },
    axisLine: { stroke: '#4B5563' },
    tickLine: { stroke: '#4B5563' },
    width: 60,
  };

  const xAxisHeight = 30;

  return (
    <div className="h-80 flex flex-col">
      {/* Chart Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-[#22d3ee]" />
          <span className="text-sm font-medium text-white">{getPeriodLabel(period)}</span>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-xs text-gray-400">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-0.5 bg-[#64748b]"></div>
            <span>Historical</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-0.5 bg-[#22d3ee]"></div>
            <span className="text-[#22d3ee]">AI Forecast</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-0.5 bg-[#10b981]" style={{ borderStyle: 'dashed' }}></div>
            <span className="text-[#10b981]">Bull</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-0.5 bg-[#ef4444]" style={{ borderStyle: 'dashed' }}></div>
            <span className="text-[#ef4444]">Bear</span>
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="flex-1 w-full relative">
        
        {/* Fixed Y-Axis Overlay */}
        <div className="absolute top-0 left-0 bottom-0 w-[60px] z-10 pointer-events-none bg-white dark:bg-[#0f1115] border-r border-gray-200 dark:border-white/5 pb-[14px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData.slice(0,1)}
              margin={{ top: 10, right: 0, left: 0, bottom: 10 }}
            >
              <YAxis 
                {...yAxisProps}
                label={{ value: 'Price (USD)', angle: -90, position: 'insideLeft', fill: '#9CA3AF', fontSize: 11, fontWeight: 500, offset: 10 }}
              />
              <XAxis dataKey="date" tick={false} axisLine={{ stroke: '#4B5563' }} tickLine={false} height={xAxisHeight} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Scrollable Chart */}
        <div 
          className="w-full h-full overflow-x-auto overflow-y-hidden custom-scrollbar pl-[60px]" 
          ref={scrollContainerRef}
        >
          <div style={{ width: `${Math.max(100, chartData.length * 40)}px`, minWidth: '100%', height: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 10 }}
              >
                <defs>
                  <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>

          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="#2D3748" 
            opacity={0.3}
            horizontal={true}
            vertical={false}
          />
          
          <Line
            type="monotone"
            dataKey="bull"
            stroke="#10b981"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            dot={false}
            activeDot={false}
            name="Bull Target"
            connectNulls={true}
          />
          
          <Line
            type="monotone"
            dataKey="bear"
            stroke="#ef4444"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            dot={false}
            activeDot={false}
            name="Bear Target"
            connectNulls={true}
          />
          
          {/* X-Axis with date labels */}
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke="#9CA3AF"
            fontSize={11}
            tick={{ fill: '#9CA3AF' }}
            axisLine={{ stroke: '#4B5563' }}
            tickLine={{ stroke: '#4B5563' }}
            padding={{ left: 10, right: 10 }}
            height={xAxisHeight}
            label={{
              value: 'Date',
              position: 'insideBottom',
              offset: -5,
              fill: '#9CA3AF',
              fontSize: 11,
              fontWeight: 500
            }}
          />
          
          {/* Y-Axis with price labels (hidden, used for scale alignment) */}
          <YAxis
            {...yAxisProps}
            hide={true}
          />
          
          <Tooltip 
            content={<CustomTooltip />}
            cursor={{ 
              stroke: '#4B5563',
              strokeWidth: 1,
              strokeDasharray: '3 3'
            }}
          />
          
          <Legend 
            wrapperStyle={{ 
              paddingTop: '10px',
              fontSize: '11px',
              color: '#9CA3AF'
            }}
            formatter={(value) => (
              <span className="text-xs text-gray-400">{value}</span>
            )}
          />
          
          {/* Historical Data Line */}
          <Line
            type="monotone"
            dataKey="historicalPrice"
            stroke="#64748b"
            strokeWidth={2}
            dot={{ 
              r: 3,
              fill: '#64748b',
              stroke: '#475569',
              strokeWidth: 1
            }}
            activeDot={{ 
              r: 6,
              fill: '#64748b',
              stroke: '#475569',
              strokeWidth: 2
            }}
            name="Historical Price"
            connectNulls={true}
          />
          
          {/* Forecast Data Line */}
          <Line
            type="monotone"
            dataKey="forecastPrice"
            stroke="#22d3ee"
            strokeWidth={3}
            dot={false}
            activeDot={{ 
              r: 6,
              fill: '#22d3ee',
              stroke: '#ffffff',
              strokeWidth: 2
            }}
            name="AI Forecast"
            connectNulls={true}
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      </div>
      </div>

      {/* Chart Footer */}
      <div className="mt-4 pt-3 border-t border-white/5">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <DollarSign size={12} className="text-cyan-400" />
              <span>Current: ${data.predictions[0]?.base.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp size={12} className="text-blue-400" />
              <span>Peak: ${maxPrice.toFixed(2)}</span>
            </div>
          </div>
          <div className="text-gray-400">
            {chartData.length} data points • {data.predictions.length} predictions
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForecastChart;