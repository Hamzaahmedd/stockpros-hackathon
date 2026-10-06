import React, { useState, useEffect } from 'react'
import { useTheme } from '@/shared/hooks/useTheme'
import { Clock, Loader2 } from 'lucide-react'
import { Skeleton } from '@/shared/components/ui/skeleton'

interface TrainingTimerProps {
  estimatedReadyAt: number
  onComplete: () => void
  symbol: string
}

const TrainingTimer: React.FC<TrainingTimerProps> = ({
  estimatedReadyAt,
  onComplete,
  symbol,
}) => {
  const { theme } = useTheme()
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    const now = Math.floor(Date.now() / 1000)
    return Math.max(0, estimatedReadyAt - now)
  })

  useEffect(() => {
    if (secondsLeft <= 0) {
      onComplete()
      return
    }

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        const next = prev - 1
        if (next <= 0) {
          clearInterval(interval)
          onComplete()
          return 0
        }
        return next
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [secondsLeft, onComplete])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progress = Math.min(100, Math.max(0, ((180 - secondsLeft) / 180) * 100))

  return (
    <div
      className={`rounded-2xl border p-8 text-center transition-all ${
        theme === 'dark'
          ? 'border-white/10 bg-[#0f1115] shadow-2xl shadow-cyan-500/10'
          : 'border-gray-200 bg-white shadow-lg'
      }`}
    >
      <div className='mb-6 flex justify-center'>
        <div className='relative'>
          <div className='absolute inset-0 animate-ping rounded-full bg-cyan-500/20'></div>
          <div className='relative rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 p-4 shadow-lg'>
            <Skeleton className='h-8 w-8 rounded-full' />
          </div>
        </div>
      </div>

      <h3
        className={`mb-2 text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}
      >
        Training AI Model for {symbol}
      </h3>
      <p
        className={`mb-6 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
      >
        Analyzing historical patterns and technical indicators to generate your
        forecast.
      </p>

      <div className='mx-auto mb-6 max-w-xs'>
        <div className='mb-2 flex items-end justify-between'>
          <span className='text-xs font-medium uppercase tracking-wider text-gray-500'>
            Progress
          </span>
          <span className='text-sm font-bold text-cyan-500'>
            {Math.round(progress)}%
          </span>
        </div>
        <div className='h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800'>
          <div
            className='h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-1000 ease-linear'
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      <div
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${
          theme === 'dark'
            ? 'border border-white/10 bg-white/5 text-cyan-400'
            : 'border border-cyan-100 bg-cyan-50 text-cyan-700'
        }`}
      >
        <Clock className='h-4 w-4' />
        <span>Estimated Completion: {formatTime(secondsLeft)}</span>
      </div>

      <p className='mt-8 text-xs italic text-gray-500'>
        "Good things come to those who wait for accurate data."
      </p>

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </div>
  )
}

export default TrainingTimer
