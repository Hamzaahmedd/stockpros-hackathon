import { Pause, Play, Trash2 } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import {
  FiAlertCircle,
  FiPlus,
  FiTrendingDown,
  FiTrendingUp as FiUp,
} from 'react-icons/fi'

import api from '@/shared/api/axios'
import { Sidebar } from '@/shared/components/Sidebar'
import { SmartSearch } from '@/shared/components/SmartSearch'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/shared/components/ui/avatar'
import { Card } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { useSocket } from '@/shared/hooks/useSocket'
import { useTheme } from '@/shared/hooks/useTheme'
import type { StockData, Trade } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_SYMBOLS = ['BINANCE:BTCUSDT', 'AAPL', 'TSLA']

const fmtPrice = (v: number) =>
  `$${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: v < 1 ? 4 : 2,
  })}`

const fmtTime = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleTimeString()

// ─── LiveStockTable ───────────────────────────────────────────────────────────

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
  useTheme()

  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS)
  const [input, setInput] = useState('')
  // Track which symbols we've already subscribed so we don't re-sub on re-render
  const subscribedRef = React.useRef<Set<string>>(new Set())

  // On connect (or reconnect), re-subscribe to all tracked symbols
  React.useEffect(() => {
    if (!connected) return
    symbols.forEach((s) => {
      if (!subscribedRef.current.has(s)) {
        subscribe(s)
        subscribedRef.current.add(s)
      }
    })
  }, [connected]) // intentionally omit symbols — handled by the effect below

  // When a new symbol is added while already connected, subscribe it immediately
  React.useEffect(() => {
    if (!connected) return
    symbols.forEach((s) => {
      if (!subscribedRef.current.has(s)) {
        subscribe(s)
        subscribedRef.current.add(s)
      }
    })
  }, [symbols]) // intentionally omit connected — handled by the effect above

  const tradeMap = getTradeMap()

  const rows: Trade[] = useMemo(() => {
    return symbols.map((s) => {
      const t = tradeMap.get(s.toUpperCase())
      if (t) {
        return { ...t, updateCount: tradeStats.get(s.toUpperCase()) || 0 }
      }
      return { s, p: Number.NaN, v: 0, snapshot: false, updateCount: 0 }
    })
  }, [symbols, tradeMap, tradeStats])

  const handleAdd = () => {
    const sym = input.trim().toUpperCase()
    if (!sym) return
    if (!symbols.includes(sym)) setSymbols((prev) => [...prev, sym])
    subscribe(sym)
    setInput('')
  }

  const handleRemove = (sym: string) => {
    unsubscribe(sym)
    subscribedRef.current.delete(sym.toUpperCase())
    setSymbols((prev) => prev.filter((x) => x !== sym))
  }

  const [prevPriceMap, setPrevPriceMap] = useState<Record<string, number>>({})
  const [flashMap, setFlashMap] = useState<
    Record<string, 'up' | 'down' | null>
  >({})

  // Detect price changes for real-time Bloomberg-style tick flash
  React.useEffect(() => {
    const newFlashes: Record<string, 'up' | 'down' | null> = {}
    rows.forEach((r) => {
      if (Number.isFinite(r.p)) {
        const prev = prevPriceMap[r.s]
        if (prev !== undefined && prev !== r.p) {
          newFlashes[r.s] = r.p > prev ? 'up' : 'down'
        }
      }
    })

    if (Object.keys(newFlashes).length > 0) {
      setFlashMap((prev) => ({ ...prev, ...newFlashes }))
      const timer = setTimeout(() => {
        setFlashMap((prev) => {
          const updated = { ...prev }
          Object.keys(newFlashes).forEach((k) => delete updated[k])
          return updated
        })
      }, 1200)
      return () => clearTimeout(timer)
    }

    // Record last seen prices
    const nextPrices: Record<string, number> = {}
    rows.forEach((r) => {
      if (Number.isFinite(r.p)) nextPrices[r.s] = r.p
    })
    setPrevPriceMap(nextPrices)
  }, [rows])

  return (
    <div className='terminal-glass overflow-hidden rounded-xl border border-border/80'>
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

      {!hideHeader && (
        <div className='border-b border-border/60 bg-background/40 p-4'>
          <div className='flex items-center gap-3'>
            <div className='flex-1'>
              <SmartSearch
                onSubmit={(sym) => {
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
            <div className='mt-3 flex gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive'>
              <FiAlertCircle className='mt-0.5 shrink-0' />
              <div>{error}</div>
            </div>
          )}
        </div>
      )}

      <div className='overflow-x-auto'>
        <table className='w-full text-left' data-tabular='true'>
          <thead>
            <tr className='border-b border-border/80 bg-muted/20'>
              {[
                'Ticker',
                'Price',
                'Volume',
                'Last Updated',
                'Status',
                'Actions',
              ].map((h, i) => (
                <th
                  key={h}
                  className={`px-5 py-3 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground ${
                    i === 1 || i === 2 || i === 3 ? 'text-right' : 'text-left'
                  }`}
                >
                  {h === 'Last Updated' ? 'Updates' : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className='divide-y divide-border/40 font-mono text-xs'>
            {rows.map((row) => {
              const flash = flashMap[row.s]
              const isSubbed = status().subscribed.includes(row.s.toUpperCase())
              return (
                <tr
                  key={row.s}
                  className={`transition-colors duration-200 hover:bg-muted/30 ${
                    flash === 'up'
                      ? 'animate-flash-up'
                      : flash === 'down'
                        ? 'animate-flash-down'
                        : ''
                  }`}
                >
                  <td className='px-5 py-3 font-bold tracking-wide'>
                    <span className='rounded border border-border/50 bg-muted/40 px-2 py-0.5 text-foreground'>
                      {row.s}
                    </span>
                  </td>
                  <td className='px-5 py-3 text-right text-sm font-bold tabular-nums'>
                    {Number.isFinite(row.p) ? (
                      <span
                        className={
                          flash === 'up'
                            ? 'text-emerald-400'
                            : flash === 'down'
                              ? 'text-rose-400'
                              : 'text-foreground'
                        }
                      >
                        {fmtPrice(row.p)}
                      </span>
                    ) : (
                      <span className='text-muted-foreground'>—</span>
                    )}
                  </td>
                  <td className='px-5 py-3 text-right tabular-nums text-muted-foreground'>
                    {row.v ? row.v.toLocaleString() : '—'}
                  </td>
                  <td className='px-5 py-3 text-right tabular-nums'>
                    <span className='rounded bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground'>
                      {row.updateCount || 0}
                    </span>
                  </td>
                  <td className='px-5 py-3'>
                    {isSubbed ? (
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
                    <td className='px-5 py-3'>
                      <div className='flex items-center gap-1.5'>
                        <button
                          onClick={() =>
                            isSubbed ? unsubscribe(row.s) : subscribe(row.s)
                          }
                          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                            isSubbed
                              ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                              : 'bg-primary/10 text-primary hover:bg-primary/20'
                          }`}
                        >
                          {isSubbed ? <Pause size={13} /> : <Play size={13} />}
                          {isSubbed ? 'Pause' : 'Stream'}
                        </button>
                        <button
                          onClick={() => handleRemove(row.s)}
                          aria-label={`Remove ${row.s}`}
                          title={`Remove ${row.s}`}
                          className='rounded-md p-1.5 text-destructive transition-all hover:bg-destructive/10'
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

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

// ─── Markets Page ─────────────────────────────────────────────────────────────

const Markets = () => {
  const [stocks, setStocks] = useState<StockData[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStocks = async () => {
    try {
      const res = await api.get('/api/v1/market/top-stocks')
      if (res.data?.success) setStocks(res.data.data)
    } catch (err) {
      console.error('Error fetching stocks:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStocks()
    const interval = setInterval(fetchStocks, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className='flex h-screen flex-col overflow-hidden bg-background text-foreground lg:flex-row'>
      <Sidebar />
      <main
        id='main-content'
        className='flex-1 overflow-y-auto overflow-x-hidden p-4 md:px-10 md:py-10'
      >
        <div className='mx-auto max-w-[1600px] space-y-10'>
          <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
            <div>
              <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
                Markets
              </h1>
              <p className='mt-1 text-sm font-medium text-muted-foreground'>
                Real-time &amp; snapshot market streaming
              </p>
            </div>
          </div>

          <Card className='overflow-hidden'>
            <LiveStockTable />
          </Card>

          <div className='flex items-center justify-between'>
            <div>
              <h2 className='text-lg font-bold tracking-tight'>
                Most Active Stocks (By Volume)
              </h2>
            </div>
          </div>

          <Card className='terminal-glass overflow-hidden border-border/80'>
            <div className='overflow-x-auto'>
              <Table
                className='min-w-[1000px] font-mono text-xs'
                data-tabular='true'
              >
                <TableHeader>
                  <TableRow className='border-border/80 bg-muted/20 hover:bg-transparent'>
                    {[
                      '#',
                      'Ticker',
                      'Asset Name',
                      'Price',
                      '24h Chg',
                      'Open',
                      'High',
                      'Low',
                      'Prev Close',
                      'Updated',
                    ].map((h, i) => (
                      <TableHead
                        key={h}
                        className={`px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground ${
                          i >= 3 ? 'text-right' : 'text-left'
                        }`}
                      >
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className='divide-y divide-border/40'>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={`sk-${i}`} className='border-border/40'>
                          <TableCell className='px-5 py-3'>
                            <Skeleton className='h-4 w-4' />
                          </TableCell>
                          <TableCell className='px-5 py-3'>
                            <div className='flex items-center gap-2'>
                              <Skeleton className='h-6 w-6 rounded-full' />
                              <Skeleton className='h-4 w-12' />
                            </div>
                          </TableCell>
                          {Array.from({ length: 8 }).map((__, j) => (
                            <TableCell key={j} className='px-5 py-3 text-right'>
                              <Skeleton className='ml-auto h-4 w-14' />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : stocks.map((r, index) => (
                        <TableRow
                          key={r.symbol}
                          className='whitespace-nowrap border-border/40 transition-colors hover:bg-muted/30'
                        >
                          <TableCell className='px-5 py-3 font-mono text-muted-foreground/80'>
                            {index + 1}
                          </TableCell>
                          <TableCell className='px-5 py-3'>
                            <div className='flex items-center gap-2.5'>
                              <Avatar className='h-6 w-6 shrink-0 border border-border/60 bg-muted/40'>
                                <AvatarImage src={r.logoUrl} alt={r.symbol} />
                                <AvatarFallback className='text-[9px] font-bold'>
                                  {r.symbol.slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <span className='font-bold tracking-wider text-foreground'>
                                {r.symbol}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className='max-w-[220px] truncate px-5 py-3 font-sans text-xs font-medium text-muted-foreground'>
                            {r.companyName}
                          </TableCell>
                          <TableCell className='px-5 py-3 text-right font-bold tabular-nums text-foreground'>
                            {fmtPrice(r.price)}
                          </TableCell>
                          <TableCell className='px-5 py-3 text-right tabular-nums'>
                            <div
                              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                                r.changePercent >= 0
                                  ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                  : 'border border-rose-500/20 bg-rose-500/10 text-rose-400'
                              }`}
                            >
                              {r.changePercent >= 0 ? (
                                <FiUp className='stroke-[3]' />
                              ) : (
                                <FiTrendingDown className='stroke-[3]' />
                              )}
                              {r.changePercent >= 0 ? '+' : ''}
                              {r.changePercent.toFixed(2)}%
                            </div>
                          </TableCell>
                          <TableCell className='px-5 py-3 text-right tabular-nums text-muted-foreground'>
                            {fmtPrice(r.open)}
                          </TableCell>
                          <TableCell className='px-5 py-3 text-right tabular-nums text-muted-foreground'>
                            {fmtPrice(r.high)}
                          </TableCell>
                          <TableCell className='px-5 py-3 text-right tabular-nums text-muted-foreground'>
                            {fmtPrice(r.low)}
                          </TableCell>
                          <TableCell className='px-5 py-3 text-right tabular-nums text-muted-foreground'>
                            {fmtPrice(r.previousClose)}
                          </TableCell>
                          <TableCell className='px-5 py-3 text-right text-[11px] tabular-nums text-muted-foreground/80'>
                            {fmtTime(r.timestamp)}
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}

export default Markets
