// components/PriceTargetRange.tsx
import React from 'react';

interface TargetRange {
  bull: number;
  base: number;
  bear: number;
  atr: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface DirectionalBias {
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  posture: 'ACCUMULATE' | 'DEFENSIVE' | 'HOLD';
  reasoning: string;
  emaBaseline: number;
  containmentRate: string;
}

interface PriceTargetRangeProps {
  targetRange: TargetRange | undefined;
  directionalBias?: DirectionalBias;
  symbol: string;
  period: string;
}

const getSignalBadgeClass = (signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'): string => {
  if (signal === 'BULLISH') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  if (signal === 'BEARISH') return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  return 'text-muted-foreground bg-muted border-border';
};

const PriceTargetRange: React.FC<PriceTargetRangeProps> = ({ targetRange, directionalBias, symbol, period }) => {
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

  const confidenceBadge = {
    HIGH: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    MEDIUM: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    LOW: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  }[confidence];

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Expected Price Range
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {symbol} • {periodLabel} target range based on price momentum and market volatility (±${atr.toFixed(2)})
          </p>
        </div>

        <div className="flex items-center gap-2">
          {directionalBias && (
            <span className={`px-2.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wide border ${getSignalBadgeClass(directionalBias.signal)}`}>
              {directionalBias.signal}
            </span>
          )}
          <span className={`px-2.5 py-0.5 rounded text-xs font-semibold border ${confidenceBadge}`}>
            {confidence} Confidence
          </span>
        </div>
      </div>

      {/* Range Visualization Bar */}
      <div className="space-y-2">
        <div className="relative h-2.5 rounded-full overflow-hidden bg-muted/60 border border-border/50">
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-rose-500/40 via-primary/30 to-emerald-500/40" />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-foreground border-2 border-background shadow-md z-10 transition-all duration-300"
            style={{ left: `calc(${Math.min(96, Math.max(4, basePosition))}% - 7px)` }}
          />
        </div>
        <div className="flex justify-between text-xs font-mono font-medium">
          <span className="text-rose-400">Low: ${bear.toFixed(2)}</span>
          <span className="text-muted-foreground text-[11px]">Midpoint: ${base.toFixed(2)}</span>
          <span className="text-emerald-400">High: ${bull.toFixed(2)}</span>
        </div>
      </div>

      {/* Target Scenario Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Bull Case */}
        <div className="p-4 rounded-lg border border-border/80 bg-muted/20 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400">
              Bull Target
            </span>
            <span className="text-xs font-mono font-semibold text-emerald-400">+{bullPct}%</span>
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">${bull.toFixed(2)}</div>
        </div>

        {/* Base Case */}
        <div className="p-4 rounded-lg border border-border/80 bg-muted/20 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-primary">
              Base Forecast
            </span>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground">
              AI Midpoint
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">${base.toFixed(2)}</div>
        </div>

        {/* Bear Case */}
        <div className="p-4 rounded-lg border border-border/80 bg-muted/20 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-400">
              Bear Target
            </span>
            <span className="text-xs font-mono font-semibold text-rose-400">{bearPct}%</span>
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">${bear.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
};

export default PriceTargetRange;
