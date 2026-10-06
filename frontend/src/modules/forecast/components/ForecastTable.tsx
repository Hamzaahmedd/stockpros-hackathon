// components/ForecastTable.tsx - Forecast Only
import React from 'react'
import { ForecastData } from '../types'
import { Calendar, BarChart3, Activity } from 'lucide-react'

interface ForecastTableProps {
  data: ForecastData | null
}

const ForecastTable: React.FC<ForecastTableProps> = ({ data }) => {
  if (!data?.predictions?.length) {
    const isTraining = data?.status === 'training'
    return (
      <div className='flex h-full flex-col items-center justify-center py-12 text-gray-400'>
        <div
          className={`h-16 w-16 rounded-full ${isTraining ? 'animate-pulse bg-amber-500/10' : 'bg-[#1A1F2E]'} mb-4 flex items-center justify-center`}
        >
          {isTraining ? (
            <Activity size={24} className='text-amber-500' />
          ) : (
            <BarChart3 size={24} className='text-gray-500' />
          )}
        </div>
        <p
          className={`text-sm font-medium ${isTraining ? 'text-amber-400' : 'text-gray-300'}`}
        >
          {isTraining ? 'AI Model Training' : 'No forecast data available'}
        </p>
        <p className='mt-2 max-w-xs px-4 text-center text-xs text-gray-500'>
          {isTraining
            ? 'Our AI model is learning historical price trends and market movements. Detailed predictions will appear here shortly.'
            : 'Select a stock symbol to view predictions'}
        </p>
      </div>
    )
  }

  const formatCurrency = (value: number): string => `$${value.toFixed(2)}`

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const calculateChange = (
    current: number,
    previous: number | null,
  ): number => {
    if (!previous) return 0
    return ((current - previous) / previous) * 100
  }

  const calculateConfidence = (index: number, total: number): number => {
    const baseConfidence = 90
    const decay = (index / total) * 20
    return Math.max(70, Math.round(baseConfidence - decay))
  }

  return (
    <div className='max-h-[400px] space-y-2 overflow-y-auto pr-1'>
      {data.predictions.map((pred, index) => {
        const previousPrice =
          index > 0 ? data.predictions[index - 1].base : null
        const change = calculateChange(pred.base, previousPrice)
        const confidence = calculateConfidence(index, data.predictions.length)
        const isPositive = change >= 0
        const isHighConfidence = confidence >= 80
        const isMediumConfidence = confidence >= 70 && confidence < 80

        const getConfidenceTextColor = () => {
          if (isHighConfidence) return 'text-emerald-400'
          if (isMediumConfidence) return 'text-amber-400'
          return 'text-rose-400'
        }

        const getConfidenceBarColor = () => {
          if (isHighConfidence) return 'bg-emerald-500'
          if (isMediumConfidence) return 'bg-amber-500'
          return 'bg-rose-500'
        }

        return (
          <div
            key={`${pred.date}-${index}`}
            className='rounded-lg border border-border/70 bg-muted/15 p-3.5 transition-colors hover:bg-muted/30'
          >
            <div className='flex items-center justify-between'>
              {/* Date & Icon */}
              <div className='flex items-center gap-3'>
                <div className='flex h-8 w-8 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary'>
                  <Calendar size={14} />
                </div>
                <div>
                  <div className='font-mono text-xs font-semibold text-foreground'>
                    {formatDate(pred.date)}
                  </div>
                  <div className='font-mono text-[11px] text-muted-foreground'>
                    Day {index + 1}
                  </div>
                </div>
              </div>

              {/* Price */}
              <div className='text-right font-mono'>
                <div className='text-sm font-bold text-foreground'>
                  {formatCurrency(pred.base)}
                </div>
                {previousPrice !== null && (
                  <div
                    className={`text-[11px] font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}
                  >
                    {isPositive ? '+' : ''}
                    {change.toFixed(2)}%
                  </div>
                )}
              </div>
            </div>

            {/* Confidence Bar */}
            <div className='mt-2.5 border-t border-border/40 pt-2'>
              <div className='mb-1 flex items-center justify-between font-mono text-[11px] text-muted-foreground'>
                <span>Confidence</span>
                <span className={`font-semibold ${getConfidenceTextColor()}`}>
                  {confidence}%
                </span>
              </div>
              <div className='h-1.5 overflow-hidden rounded-full bg-muted'>
                <div
                  className={`h-full rounded-full ${getConfidenceBarColor()}`}
                  style={{ width: `${confidence}%` }}
                />
              </div>
            </div>
          </div>
        )
      })}

      {/* Summary Footer */}
      <div className='mt-4 rounded-lg border border-border/60 bg-muted/20 p-3'>
        <div className='flex items-center justify-between font-mono text-xs'>
          <div className='text-muted-foreground'>
            <span className='font-semibold text-foreground'>
              {data.predictions.length}
            </span>{' '}
            days forecasted
          </div>
          <div className='flex items-center gap-4 text-[11px] text-muted-foreground'>
            <span className='flex items-center gap-1.5'>
              <div className='h-1.5 w-1.5 rounded-full bg-emerald-500'></div>
              <span>High (≥80%)</span>
            </span>
            <span className='flex items-center gap-1.5'>
              <div className='h-1.5 w-1.5 rounded-full bg-amber-500'></div>
              <span>Medium (70–79%)</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ForecastTable
