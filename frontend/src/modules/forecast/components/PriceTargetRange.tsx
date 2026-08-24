// components/PriceTargetRange.tsx
import React from 'react';
import { TrendingUp, TrendingDown, Target, Activity, Shield } from 'lucide-react';
import { useTheme } from '@/shared/hooks/useTheme';

interface TargetRange {
  bull: number;
  base: number;
  bear: number;
  atr: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface PriceTargetRangeProps {
  targetRange: TargetRange | undefined;
  symbol: string;
  period: string;
}

const PriceTargetRange: React.FC<PriceTargetRangeProps> = ({ targetRange, symbol, period }) => {
  const { theme } = useTheme();

  if (!targetRange) {
    return null;
  }

  const { bull, base, bear, atr, confidence } = targetRange;
  const spread = bull - bear;
  const bullPct = base > 0 ? (((bull - base) / base) * 100).toFixed(2) : '0.00';
  const bearPct = base > 0 ? (((bear - base) / base) * 100).toFixed(2) : '0.00';

  // Position of base within the range bar (0-100%)
  const basePosition = spread > 0 ? ((base - bear) / spread) * 100 : 50;

  const periodLabel = period === '1d' ? '1 Day' : '1 Week';

  const confidenceConfig = {
    HIGH: {
      label: 'High Confidence',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/20',
      border: 'border-emerald-500/30',
      barColor: 'bg-emerald-500',
      width: 'w-full',
    },
    MEDIUM: {
      label: 'Medium Confidence',
      color: 'text-amber-400',
      bg: 'bg-amber-500/20',
      border: 'border-amber-500/30',
      barColor: 'bg-amber-500',
      width: 'w-2/3',
    },
    LOW: {
      label: 'Low Confidence',
      color: 'text-red-400',
      bg: 'bg-red-500/20',
      border: 'border-red-500/30',
      barColor: 'bg-red-500',
      width: 'w-1/3',
    },
  };

  const conf = confidenceConfig[confidence];

  return (
    <div className={`border rounded-2xl p-6 transition-all duration-300 relative overflow-hidden ${
      theme === 'dark'
        ? 'bg-[#0f1115] border-white/5 hover:border-white/10 shadow-xl shadow-cyan-500/5'
        : 'bg-white border-gray-200 shadow-sm'
    }`}>
      {/* Subtle gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-emerald-500/0 via-cyan-500/50 to-emerald-500/0" />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            theme === 'dark' ? 'bg-cyan-500/10' : 'bg-cyan-50'
          }`}>
            <Target size={20} className="text-cyan-400" />
          </div>
          <div>
            <h2 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
              Price Target Range
            </h2>
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
              {symbol} • {periodLabel} Outlook • ATR: ${atr.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Confidence Badge */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${conf.bg} ${conf.border}`}>
          <Shield size={14} className={conf.color} />
          <span className={`text-xs font-semibold ${conf.color}`}>{conf.label}</span>
        </div>
      </div>

      {/* Range Visualization Bar */}
      <div className="mb-6">
        <div className={`relative h-3 rounded-full overflow-hidden ${
          theme === 'dark' ? 'bg-white/5' : 'bg-gray-100'
        }`}>
          {/* Gradient fill */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500/60 via-cyan-500/60 to-emerald-500/60" />

          {/* Base marker */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-cyan-400 border-2 border-white shadow-lg shadow-cyan-500/50 z-10 transition-all"
            style={{ left: `calc(${basePosition}% - 8px)` }}
          />
        </div>

        {/* Range Labels */}
        <div className="flex justify-between mt-2">
          <span className="text-xs text-red-400 font-medium">${bear.toFixed(2)}</span>
          <span className="text-xs text-emerald-400 font-medium">${bull.toFixed(2)}</span>
        </div>
      </div>

      {/* Three Scenario Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Bull Case */}
        <div className={`group relative rounded-xl p-4 border transition-all duration-300 hover:scale-[1.02] ${
          theme === 'dark'
            ? 'bg-emerald-500/5 border-emerald-500/10 hover:border-emerald-500/30 hover:bg-emerald-500/10'
            : 'bg-emerald-50 border-emerald-200 hover:border-emerald-300'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <TrendingUp size={14} className="text-emerald-400" />
            </div>
            <span className={`text-xs font-bold uppercase tracking-wider ${
              theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
            }`}>
              Target High ({periodLabel})
            </span>
          </div>
          <div className={`text-2xl font-bold mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            ${bull.toFixed(2)}
          </div>
          <div className="text-emerald-400 text-xs font-semibold mb-2">+{bullPct}% from base</div>
          <p className={`text-xs leading-relaxed ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            If momentum holds, price could reach this level.
          </p>
        </div>

        {/* Base Case */}
        <div className={`group relative rounded-xl p-4 border transition-all duration-300 hover:scale-[1.02] ${
          theme === 'dark'
            ? 'bg-cyan-500/5 border-cyan-500/10 hover:border-cyan-500/30 hover:bg-cyan-500/10'
            : 'bg-blue-50 border-blue-200 hover:border-blue-300'
        }`}>
          {/* "AI Predicted" accent */}
          <div className="absolute top-0 right-0">
            <div className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-bl-lg rounded-tr-xl ${
              theme === 'dark' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-blue-100 text-blue-600'
            }`}>
              GRU Model
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Activity size={14} className="text-cyan-400" />
            </div>
            <span className={`text-xs font-bold uppercase tracking-wider ${
              theme === 'dark' ? 'text-cyan-400' : 'text-blue-600'
            }`}>
              Base Case
            </span>
          </div>
          <div className={`text-2xl font-bold mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            ${base.toFixed(2)}
          </div>
          <div className={`text-xs font-semibold mb-2 ${theme === 'dark' ? 'text-cyan-400' : 'text-blue-500'}`}>
            AI Terminal Prediction
          </div>
          <p className={`text-xs leading-relaxed ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            Current trajectory continues, price settles near this level.
          </p>
        </div>

        {/* Bear Case */}
        <div className={`group relative rounded-xl p-4 border transition-all duration-300 hover:scale-[1.02] ${
          theme === 'dark'
            ? 'bg-red-500/5 border-red-500/10 hover:border-red-500/30 hover:bg-red-500/10'
            : 'bg-red-50 border-red-200 hover:border-red-300'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center">
              <TrendingDown size={14} className="text-red-400" />
            </div>
            <span className={`text-xs font-bold uppercase tracking-wider ${
              theme === 'dark' ? 'text-red-400' : 'text-red-600'
            }`}>
              Target Low ({periodLabel})
            </span>
          </div>
          <div className={`text-2xl font-bold mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            ${bear.toFixed(2)}
          </div>
          <div className="text-red-400 text-xs font-semibold mb-2">{bearPct}% from base</div>
          <p className={`text-xs leading-relaxed ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            If sentiment deteriorates, support at this level.
          </p>
        </div>
      </div>

      {/* Confidence Bar */}
      <div className="mt-5 pt-4 border-t border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
            Signal Agreement
          </span>
          <span className={`text-xs font-semibold ${conf.color}`}>{conf.label}</span>
        </div>
        <div className={`h-1.5 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-white/5' : 'bg-gray-100'}`}>
          <div className={`h-full rounded-full transition-all duration-700 ${conf.barColor} ${conf.width}`} />
        </div>
        <p className={`text-[10px] mt-2 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>
          Based on EMA/swing-low support agreement. ATR volatility band: ±${atr.toFixed(2)}
        </p>
      </div>
    </div>
  );
};

export default PriceTargetRange;
