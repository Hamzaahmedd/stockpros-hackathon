import React from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts'

export const StockTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    return (
      <div className='rounded-lg border border-border bg-popover px-2.5 py-1.5 font-mono text-xs text-popover-foreground shadow-xl'>
        <div className='text-[10px] text-muted-foreground'>Price</div>
        <div className='font-bold tabular-nums'>
          ${Number(payload[0].value).toFixed(2)}
        </div>
      </div>
    )
  }
  return null
}

export const TrendingStockCard: React.FC<{ stock: any }> = ({ stock }) => {
  const changePercent = Number(stock.changePercent)
  const price = Number(stock.price)
  const isPositive = Number.isFinite(changePercent) ? changePercent >= 0 : true

  const chartData =
    stock.sparkline?.map((p: number, idx: number) => ({
      name: idx,
      value: p,
    })) || []

  const formattedChangePercent = (() => {
    if (!Number.isFinite(changePercent)) return '—'
    const prefix = isPositive ? '+' : ''
    return `${prefix}${changePercent.toFixed(2)}%`
  })()

  return (
    <div className='terminal-glass group flex flex-col justify-between overflow-hidden rounded-xl border border-border/70 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5'>
      <div className='flex items-start justify-between p-4'>
        <div className='flex items-center gap-3'>
          <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/40 p-1.5'>
            {stock.logoUrl ? (
              <img
                src={stock.logoUrl}
                alt={stock.symbol}
                className='h-full w-full object-contain'
              />
            ) : (
              <div className='font-mono text-xs font-bold text-primary'>
                {stock.symbol.slice(0, 2)}
              </div>
            )}
          </div>
          <div className='min-w-0'>
            <div className='truncate font-mono text-sm font-bold tracking-wider text-foreground'>
              {stock.symbol}
            </div>
            <div className='max-w-[130px] truncate text-[11px] font-medium text-muted-foreground'>
              {stock.companyName}
            </div>
          </div>
        </div>
        <div className='text-right font-mono'>
          <div className='text-base font-bold tabular-nums tracking-tight text-foreground'>
            {Number.isFinite(price) ? `$${price.toFixed(2)}` : '—'}
          </div>
          <div
            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
              isPositive
                ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                : 'border border-rose-500/20 bg-rose-500/10 text-rose-400'
            }`}
          >
            {formattedChangePercent}
          </div>
        </div>
      </div>

      <div className='-mb-1 h-16 w-full'>
        <ResponsiveContainer width='100%' height='100%'>
          <AreaChart
            data={chartData}
            margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient
                id={`grad-${stock.symbol}`}
                x1='0'
                y1='0'
                x2='0'
                y2='1'
              >
                <stop
                  offset='5%'
                  stopColor={isPositive ? '#10b981' : '#f43f5e'}
                  stopOpacity={0.35}
                />
                <stop
                  offset='95%'
                  stopColor={isPositive ? '#10b981' : '#f43f5e'}
                  stopOpacity={0.0}
                />
              </linearGradient>
            </defs>
            <Tooltip content={<StockTooltip />} />
            <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
            <Area
              type='monotone'
              dataKey='value'
              stroke={isPositive ? '#10b981' : '#f43f5e'}
              fill={`url(#grad-${stock.symbol})`}
              strokeWidth={1.75}
              isAnimationActive={true}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
