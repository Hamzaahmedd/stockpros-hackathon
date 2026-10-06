// components/PriceTargetRange.tsx
import React from 'react'

interface TargetRange {
  bull: number
  base: number
  bear: number
  atr: number
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

interface DirectionalBias {
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  posture: 'ACCUMULATE' | 'DEFENSIVE' | 'HOLD'
  reasoning: string
  emaBaseline: number
  containmentRate: string
}

interface PriceTargetRangeProps {
  targetRange: TargetRange | undefined
  directionalBias?: DirectionalBias
  symbol: string
  period: string
}

const getSignalBadgeClass = (
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
): string => {
  if (signal === 'BULLISH')
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
  if (signal === 'BEARISH')
    return 'text-rose-400 bg-rose-500/10 border-rose-500/20'
  return 'text-muted-foreground bg-muted border-border'
}

const PriceTargetRange: React.FC<PriceTargetRangeProps> = ({
  targetRange,
  directionalBias,
  symbol,
  period,
}) => {
  if (!targetRange) {
    return null
  }

  const { bull, base, bear, atr, confidence } = targetRange
  const spread = bull - bear
  const bullPct = base > 0 ? (((bull - base) / base) * 100).toFixed(2) : '0.00'
  const bearPct = base > 0 ? (((bear - base) / base) * 100).toFixed(2) : '0.00'

  // Position of base within the range bar (0-100%)
  const basePosition = spread > 0 ? ((base - bear) / spread) * 100 : 50
  const periodLabel = period === '1d' ? '1 Day' : '1 Week'

  const confidenceBadge = {
    HIGH: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    MEDIUM: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    LOW: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  }[confidence]

  return (
    <div className='space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm'>
      {/* Top Header */}
      <div className='flex flex-col justify-between gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-center'>
        <div>
          <h3 className='text-sm font-semibold text-foreground'>
            Expected Price Range
          </h3>
          <p className='mt-0.5 text-xs text-muted-foreground'>
            {symbol} • {periodLabel} target range based on price momentum and
            market volatility (±${atr.toFixed(2)})
          </p>
        </div>

        <div className='flex items-center gap-2'>
          {directionalBias && (
            <span
              className={`rounded border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${getSignalBadgeClass(directionalBias.signal)}`}
            >
              {directionalBias.signal}
            </span>
          )}
          <span
            className={`rounded border px-2.5 py-0.5 text-xs font-semibold ${confidenceBadge}`}
          >
            {confidence} Confidence
          </span>
        </div>
      </div>

      {/* Range Visualization Bar */}
      <div className='space-y-2'>
        <div className='relative h-2.5 overflow-hidden rounded-full border border-border/50 bg-muted/60'>
          <div className='absolute inset-0 rounded-full bg-gradient-to-r from-rose-500/40 via-primary/30 to-emerald-500/40' />
          <div
            className='absolute top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow-md transition-all duration-300'
            style={{
              left: `calc(${Math.min(96, Math.max(4, basePosition))}% - 7px)`,
            }}
          />
        </div>
        <div className='flex justify-between font-mono text-xs font-medium'>
          <span className='text-rose-400'>Low: ${bear.toFixed(2)}</span>
          <span className='text-[11px] text-muted-foreground'>
            Midpoint: ${base.toFixed(2)}
          </span>
          <span className='text-emerald-400'>High: ${bull.toFixed(2)}</span>
        </div>
      </div>

      {/* Target Scenario Cards */}
      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        {/* Bull Case */}
        <div className='space-y-1 rounded-lg border border-border/80 bg-muted/20 p-4'>
          <div className='flex items-center justify-between'>
            <span className='text-xs font-semibold text-emerald-400'>
              Bull Target
            </span>
            <span className='font-mono text-xs font-semibold text-emerald-400'>
              +{bullPct}%
            </span>
          </div>
          <div className='font-mono text-2xl font-bold text-foreground'>
            ${bull.toFixed(2)}
          </div>
        </div>

        {/* Base Case */}
        <div className='space-y-1 rounded-lg border border-border/80 bg-muted/20 p-4'>
          <div className='flex items-center justify-between'>
            <span className='text-xs font-semibold text-primary'>
              Base Forecast
            </span>
            <span className='rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground'>
              AI Midpoint
            </span>
          </div>
          <div className='font-mono text-2xl font-bold text-foreground'>
            ${base.toFixed(2)}
          </div>
        </div>

        {/* Bear Case */}
        <div className='space-y-1 rounded-lg border border-border/80 bg-muted/20 p-4'>
          <div className='flex items-center justify-between'>
            <span className='text-xs font-semibold text-rose-400'>
              Bear Target
            </span>
            <span className='font-mono text-xs font-semibold text-rose-400'>
              {bearPct}%
            </span>
          </div>
          <div className='font-mono text-2xl font-bold text-foreground'>
            ${bear.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PriceTargetRange
