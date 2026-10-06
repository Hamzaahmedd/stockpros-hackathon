import { SmartSearch } from '@/shared/components/SmartSearch'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { useSocket } from '@/shared/hooks/useSocket'
import React, { useMemo, useState } from 'react'
import { FiAlertCircle, FiPlus } from 'react-icons/fi'
import type { Trade } from '../types'

const DEFAULT_SYMBOLS = ['BINANCE:BTCUSDT', 'AAPL', 'TSLA']

export const LiveStockTable: React.FC<{ hideHeader?: boolean }> = ({
  hideHeader = false,
}) => {
  const {
    connected,
    error,
    subscribe,
    unsubscribe,
    getTradeMap,
    tradeStats,
    lastUpdate,
    status,
  } = useSocket(true)

  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS)
  const [input, setInput] = useState('')

  // Auto-subscribe to initial symbols on mount/connection
  React.useEffect(() => {
    if (connected) {
      symbols.forEach((s) => subscribe(s))
    }
    return () => {
      symbols.forEach((s) => unsubscribe(s))
    }
  }, [connected, symbols, subscribe, unsubscribe])

  const tradeMap = getTradeMap()

  const rows: Trade[] = useMemo(() => {
    return symbols.map((s) => {
      const t = tradeMap.get(s.toUpperCase())
      if (t) {
        return {
          ...t,
          updateCount: tradeStats.get(s.toUpperCase()) || 0,
        }
      }
      return {
        s,
        p: Number.NaN,
        v: 0,
        snapshot: false,
        updateCount: 0,
      }
    })
  }, [symbols, tradeMap, tradeStats])

  const handleAdd = () => {
    const sym = input.trim().toUpperCase()
    if (!sym) return

    if (!symbols.includes(sym)) {
      setSymbols((prev) => [...prev, sym])
    }

    // Always call subscribe to allow retrying/refreshing a connection
    subscribe(sym)
    setInput('')
  }

  const handleRemove = (sym: string) => {
    unsubscribe(sym)
    setSymbols((prev) => prev.filter((x) => x !== sym))
  }

  return (
    <div className='overflow-hidden rounded-lg'>
      {/* Header */}
      {!hideHeader && (
        <div className='flex items-center justify-between border-b border-border p-5'>
          <div>
            <h3 className='text-lg font-semibold'>Live Stock Data</h3>
            <p className='mt-1 text-sm text-muted-foreground'>
              Real-time market streaming
            </p>
          </div>
          <div className='flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5'>
            <div className='h-2 w-2 animate-pulse rounded-full bg-primary' />
            <span className='text-xs font-medium text-primary'>
              {connected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
        </div>
      )}

      {/* Controls */}
      {!hideHeader && (
        <div className='border-b border-border p-5'>
          <div className='flex items-center gap-3'>
            <div className='flex-1'>
              <SmartSearch
                onSubmit={(sym) => {
                  setInput(sym)
                  const newSymbols = sym.includes(',')
                    ? sym.split(',').map((s) => s.trim().toUpperCase())
                    : [sym.toUpperCase()]
                  newSymbols.forEach((s) => {
                    if (s && !symbols.includes(s)) {
                      setSymbols((prev) => [...prev, s])
                      subscribe(s)
                    }
                  })
                  setInput('')
                }}
                placeholder='Add symbol (e.g., AAPL, TSLA)'
                initialValue={input}
              />
            </div>
            <button
              onClick={handleAdd}
              className='flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90'
            >
              <FiPlus /> Subscribe
            </button>
          </div>

          {error && (
            <div className='mt-3 flex gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4'>
              <FiAlertCircle className='mt-0.5 text-destructive' />
              <div>
                <div className='text-sm font-medium text-destructive'>
                  Connection Error
                </div>
                <div className='mt-1 text-sm text-destructive/80'>{error}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className='overflow-x-auto'>
        <table className='w-full'>
          <thead>
            <tr className='border-b border-border'>
              {[
                'Symbol',
                'Price',
                'Volume',
                'Last Time',
                'Status',
                'Actions',
              ].map((h) => (
                <th
                  key={h}
                  className='px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground'
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.s}
                className={`border-b border-border transition-colors ${index % 2 === 0 ? 'bg-muted/20 hover:bg-muted/40' : 'hover:bg-muted/30'}`}
              >
                <td className='px-6 py-3.5 font-bold tracking-wide text-foreground'>
                  {row.s}
                </td>

                <td className='px-6 py-3.5 font-bold'>
                  {Number.isFinite(row.p) ? `$${row.p.toFixed(2)}` : '—'}
                </td>

                <td className='px-6 py-3.5 text-muted-foreground'>
                  {row.v ? row.v.toLocaleString() : '—'}
                </td>

                {!hideHeader && (
                  <td className='px-6 py-3.5 text-xs text-muted-foreground'>
                    {row.t ? new Date(row.t).toLocaleTimeString() : '—'}
                  </td>
                )}

                <td className='px-6 py-3.5'>
                  {status().subscribed.includes(row.s.toUpperCase()) ? (
                    <span className='flex items-center gap-1.5 font-medium text-green-500'>
                      <div className='h-1.5 w-1.5 animate-pulse rounded-full bg-green-500' />
                      Streaming
                    </span>
                  ) : (
                    <span className='flex items-center gap-1.5 text-muted-foreground'>
                      <div className='h-1.5 w-1.5 rounded-full bg-muted-foreground' />
                      Paused
                    </span>
                  )}
                </td>

                {!hideHeader && (
                  <td className='px-6 py-3.5'>
                    <div className='flex items-center gap-2'>
                      <button
                        onClick={() => subscribe(row.s)}
                        disabled={status().subscribed.includes(
                          row.s.toUpperCase(),
                        )}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                          status().subscribed.includes(row.s.toUpperCase())
                            ? 'cursor-not-allowed bg-muted text-muted-foreground'
                            : 'bg-primary/10 text-primary hover:bg-primary/20'
                        }`}
                      >
                        Subscribe
                      </button>
                      <button
                        onClick={() => unsubscribe(row.s)}
                        disabled={
                          !status().subscribed.includes(row.s.toUpperCase())
                        }
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                          !status().subscribed.includes(row.s.toUpperCase())
                            ? 'cursor-not-allowed bg-muted text-muted-foreground'
                            : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                        }`}
                      >
                        Unsubscribe
                      </button>
                      <button
                        onClick={() => handleRemove(row.s)}
                        className='rounded-md bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive transition-all hover:bg-destructive/20'
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {!hideHeader && (
        <div className='border-t border-border p-5'>
          <div className='text-sm text-muted-foreground'>
            Showing {rows.length} symbols • Last updated:{' '}
            {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : '—'}
          </div>
          {!connected && (
            <div className='flex items-center gap-2 text-xs text-muted-foreground'>
              <Skeleton className='h-5 w-5 rounded-full' />
              Connecting...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
