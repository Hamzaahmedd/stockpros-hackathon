import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { UsageHistoryDay } from '../types'
import { formatChartDay, formatPaisa } from '../utils'

const AXIS_TICK = { fill: 'hsl(var(--muted-foreground))', fontSize: 11 }

interface TooltipContentProps {
  active?: boolean
  payload?: { payload: UsageHistoryDay }[]
}

function DayTooltip({ active, payload }: TooltipContentProps) {
  const day = active ? payload?.[0]?.payload : undefined
  if (!day) return null
  return (
    <div className='rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl'>
      <p className='font-semibold'>{formatChartDay(day.date)}</p>
      <p className='tabular-nums'>
        {day.signals} signal{day.signals === 1 ? '' : 's'}
      </p>
      {day.creditSpentPaisa > 0 && (
        <p className='tabular-nums text-muted-foreground'>
          {formatPaisa(day.creditSpentPaisa)} from credits
        </p>
      )}
    </div>
  )
}

interface UsageHistoryChartProps {
  days: UsageHistoryDay[]
}

/**
 * AI signals used per day: one series, so one colour and no legend (the card
 * heading names it). The same numbers are available as a table below it, so
 * the chart is never the only way to read them.
 */
export function UsageHistoryChart({ days }: UsageHistoryChartProps) {
  return (
    <div>
      <div
        role='img'
        aria-label='AI signals used per day'
        className='h-56 w-full'
      >
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart
            data={days}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke='hsl(var(--border))'
              strokeDasharray='3 3'
            />
            <XAxis
              dataKey='date'
              tickFormatter={formatChartDay}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              content={<DayTooltip />}
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
            />
            <Bar
              dataKey='signals'
              fill='hsl(var(--primary))'
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <details className='mt-3 text-sm'>
        <summary className='cursor-pointer text-muted-foreground'>
          View as table
        </summary>
        <div className='mt-2 max-h-64 overflow-y-auto rounded-lg border border-border'>
          <table className='w-full text-left text-sm'>
            <thead className='sticky top-0 bg-card text-xs text-muted-foreground'>
              <tr>
                <th scope='col' className='p-2 font-medium'>
                  Day
                </th>
                <th scope='col' className='p-2 text-right font-medium'>
                  Signals
                </th>
                <th scope='col' className='p-2 text-right font-medium'>
                  From credits
                </th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date} className='border-t border-border'>
                  <th scope='row' className='p-2 font-normal'>
                    {formatChartDay(day.date)}
                  </th>
                  <td className='p-2 text-right tabular-nums'>{day.signals}</td>
                  <td className='p-2 text-right tabular-nums'>
                    {formatPaisa(day.creditSpentPaisa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
