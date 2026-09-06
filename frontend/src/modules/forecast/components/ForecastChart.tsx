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
  ResponsiveContainer,
  ReferenceLine,
  TooltipProps
} from 'recharts';
import { ForecastData } from '../types';
import { TrendingUp, Calendar, DollarSign, LineChart as LineChartIcon } from 'lucide-react';

interface ForecastChartProps {
  data: ForecastData | null;
  period: string;
  highlightedDate?: string | null;
  onHoverDate?: (date: string | null) => void;
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

  // Connection point: bridge historical to forecast without a gap
  if (chartData.length > 0) {
    const lastHistPrice = chartData[chartData.length - 1].historicalPrice;
    chartData[chartData.length - 1].forecastPrice = lastHistPrice;
    chartData[chartData.length - 1].bull = lastHistPrice;
    chartData[chartData.length - 1].bear = lastHistPrice;
  }

  // Find the index where forecast starts (for the reference line)
  const forecastStartIndex = chartData.length - 1;

  data.predictions.forEach((pred, idx) => {
    chartData.push({
      date: pred.date,
      historicalPrice: null,
      forecastPrice: pred.base,
      bull: pred.bull ?? null,
      bear: pred.bear ?? null,
      type: 'forecast',
      isCurrentPrice: idx === 0
    });
  });

  const allPrices = chartData.flatMap(d => [
    d.historicalPrice,
    d.forecastPrice,
    d.bull,
    d.bear
  ]).filter((p): p is number => p !== null && p !== undefined);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const pricePadding = (maxPrice - minPrice) * 0.12;

  const forecastStartDate = forecastStartIndex >= 0 ? chartData[forecastStartIndex]?.date : null;

  const formatDate = (date: string): string => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Karachi'
    });
  };

  const getPeriodLabel = (p: string): string => {
    switch (p) {
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
        weekday: 'short',
        month: 'long',
        day: 'numeric'
      });

      return (
        <div className="bg-[#13161f] p-3 border border-white/10 rounded-xl shadow-2xl min-w-[180px]">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/5">
            <Calendar size={12} className="text-[#22d3ee]" />
            <p className="text-xs font-medium text-white">{fullDate}</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-6">
              <span className="text-[11px] text-gray-400">
                {isForecast ? (dataPoint.isCurrentPrice ? 'Current' : 'Forecast') : 'Close'}
              </span>
              <span className="text-xs font-semibold text-white">${displayValue?.toFixed(2)}</span>
            </div>
            {isForecast && dataPoint.bull !== null && dataPoint.bear !== null && (
              <>
                <div className="flex items-center justify-between gap-6">
                  <span className="text-[11px] text-emerald-400">Bull Target</span>
                  <span className="text-xs font-medium text-emerald-400">${dataPoint.bull?.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between gap-6">
                  <span className="text-[11px] text-rose-400">Bear Target</span>
                  <span className="text-xs font-medium text-rose-400">${dataPoint.bear?.toFixed(2)}</span>
                </div>
              </>
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
    tickFormatter: (value: number) => `$${value.toFixed(0)}`,
    fontSize: 11,
    tick: { fill: '#6B7280' },
    axisLine: { stroke: '#374151' },
    tickLine: { stroke: '#374151' },
    width: 60,
  };

  const xAxisHeight = 30;

  return (
    <div className="h-80 flex flex-col">
      {/* Legend */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-[#22d3ee]" />
          <span className="text-sm font-semibold text-white">{getPeriodLabel(period)}</span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 bg-[#475569] rounded"></div>
            <span>Historical</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 bg-[#22d3ee] rounded"></div>
            <span className="text-[#22d3ee]">Forecast</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 bg-[#10b981] rounded" style={{ borderTop: '1px dashed #10b981' }}></div>
            <span className="text-[#10b981]">Bull Target</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 bg-[#ef4444] rounded" style={{ borderTop: '1px dashed #ef4444' }}></div>
            <span className="text-[#ef4444]">Bear Target</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 w-full relative">

        {/* Fixed Y-Axis */}
        <div className="absolute top-0 left-0 bottom-0 w-[60px] z-10 pointer-events-none bg-white dark:bg-[#0f1115] border-r border-gray-200 dark:border-white/5 pb-[14px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData.slice(0, 1)}
              margin={{ top: 8, right: 0, left: 0, bottom: 10 }}
            >
              <YAxis {...yAxisProps} />
              <XAxis dataKey="date" tick={false} axisLine={{ stroke: '#374151' }} tickLine={false} height={xAxisHeight} />
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
                margin={{ top: 8, right: 24, left: 0, bottom: 10 }}
              >
                <defs>
                  {/* Glow filter for forecast line */}
                  <filter id="forecastGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  {/* Shaded area under forecast midline */}
                  <linearGradient id="forecastAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="#1F2937"
                  opacity={0.8}
                  horizontal={true}
                  vertical={false}
                />

                {/* Divider line between historical and forecast */}
                {forecastStartDate && (
                  <ReferenceLine
                    x={forecastStartDate}
                    stroke="#374151"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    label={{ value: 'Today', position: 'insideTopRight', fill: '#6B7280', fontSize: 10 }}
                  />
                )}

                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="#374151"
                  fontSize={11}
                  tick={{ fill: '#6B7280' }}
                  axisLine={{ stroke: '#374151' }}
                  tickLine={false}
                  padding={{ left: 10, right: 10 }}
                  height={xAxisHeight}
                />

                <YAxis {...yAxisProps} hide={true} />

                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{
                    stroke: '#374151',
                    strokeWidth: 1,
                    strokeDasharray: '3 3'
                  }}
                />

                {/* Shaded fill under forecast midline */}
                <Area
                  type="monotone"
                  dataKey="forecastPrice"
                  stroke="none"
                  fill="url(#forecastAreaGrad)"
                  connectNulls={true}
                  legendType="none"
                  dot={false}
                  activeDot={false}
                />

                {/* Bull (upside) band edge */}
                <Line
                  type="monotone"
                  dataKey="bull"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
                  connectNulls={true}
                  legendType="none"
                />

                {/* Bear (downside) band edge */}
                <Line
                  type="monotone"
                  dataKey="bear"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={{ r: 4, fill: '#ef4444', strokeWidth: 0 }}
                  connectNulls={true}
                  legendType="none"
                />

                {/* Historical price line */}
                <Line
                  type="monotone"
                  dataKey="historicalPrice"
                  stroke="#475569"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: '#64748b', strokeWidth: 0 }}
                  connectNulls={true}
                  legendType="none"
                />

                {/* AI Forecast midline — brightest element */}
                <Line
                  type="monotone"
                  dataKey="forecastPrice"
                  stroke="#22d3ee"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 6, fill: '#22d3ee', stroke: '#fff', strokeWidth: 1.5 }}
                  connectNulls={true}
                  legendType="none"
                  style={{ filter: 'url(#forecastGlow)' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-white/5">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <DollarSign size={11} className="text-cyan-400" />
              <span>Now: <span className="text-gray-300 font-medium">${data.predictions[0]?.base.toFixed(2)}</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp size={11} className="text-emerald-400" />
              <span>Peak: <span className="text-gray-300 font-medium">${maxPrice.toFixed(2)}</span></span>
            </div>
          </div>
          <span>{data.predictions.length} day{data.predictions.length !== 1 ? 's' : ''} forecasted</span>
        </div>
      </div>
    </div>
  );
};

export default ForecastChart;