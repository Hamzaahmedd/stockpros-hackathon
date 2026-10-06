import { OrgContextBanner } from '@/shared/components/OrgContextBanner'
import api from '@/shared/api/axios'
import { Sidebar } from '@/shared/components/Sidebar'
import { SmartSearch } from '@/shared/components/SmartSearch'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { useTheme } from '@/shared/hooks/useTheme'
import React, { useEffect, useRef, useState } from 'react'
import {
  FiActivity,
  FiAward,
  FiChevronDown,
  FiChevronUp,
  FiClock,
  FiDollarSign,
  FiDownload,
  FiInfo,
  FiShield,
  FiSliders,
  FiTarget,
  FiTrendingDown,
  FiTrendingUp,
  FiUsers,
  FiZap,
} from 'react-icons/fi'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import type { PositionSizeResult } from '../types'
import { downloadTradePlanPdf } from '../utils/downloadTradePlanPdf'

interface TradingViewWidgetProps {
  symbol: string
  theme: string
}

const TradingViewWidget: React.FC<TradingViewWidgetProps> = ({
  symbol,
  theme,
}) => {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!container.current) return

    const script = document.createElement('script')
    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `NASDAQ:${symbol}`,
      interval: 'D',
      timezone: 'Asia/Karachi',
      theme,
      style: '1',
      locale: 'en',
      enable_publishing: false,
      allow_symbol_change: true,
      container_id: 'tradingview_analysis',
    })

    container.current.innerHTML = ''
    container.current.appendChild(script)
  }, [symbol, theme])

  return (
    <div
      className='tradingview-widget-container'
      ref={container}
      style={{ height: '100%', width: '100%' }}
    >
      <div
        className='tradingview-widget-container__widget'
        style={{ height: '100%', width: '100%' }}
      ></div>
    </div>
  )
}

const MarketAnalysis: React.FC = () => {
  const { theme } = useTheme()
  const [searchParams] = useSearchParams()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentSymbol, setCurrentSymbol] = useState<string | null>(null)

  // Sizing Panel State
  const [isSizerOpen, setIsSizerOpen] = useState(true)
  const [capitalInput, setCapitalInput] = useState<number>(10000)
  const [sizingResult, setSizingResult] = useState<PositionSizeResult | null>(
    null,
  )

  // Read via a ref inside fetchDecision so the 10s polling interval (which only
  // recreates its closure when currentSymbol changes) always sizes against the
  // capital the user currently has entered, not whatever it was when the poll started.
  const capitalInputRef = useRef(capitalInput)
  useEffect(() => {
    capitalInputRef.current = capitalInput
  }, [capitalInput])

  const calculateSizing = async (
    symbol: string,
    capital: number,
    priceTargets?: any,
    currentPrice?: number,
  ) => {
    try {
      const res = await api.post(
        '/api/v1/decision-support/market/position-size',
        {
          symbol,
          capital,
        },
      )
      if (res.data.success && res.data.data) {
        setSizingResult(res.data.data)
      }
    } catch {
      // Local fallback calculation
      if (priceTargets && currentPrice) {
        const shares = Math.floor(capital / currentPrice)
        const riskPerShare = Math.max(0, currentPrice - priceTargets.stopLoss)
        const totalRisk = Number((shares * riskPerShare).toFixed(2))
        const potentialGain = Number(
          (
            shares * Math.max(0, priceTargets.bullTarget - currentPrice)
          ).toFixed(2),
        )
        const riskRewardRatio =
          totalRisk > 0 ? Number((potentialGain / totalRisk).toFixed(2)) : 0
        const percentOfCapital = Number(
          (((shares * currentPrice) / capital) * 100).toFixed(2),
        )

        setSizingResult({
          symbol,
          capital,
          currentPrice,
          stopLoss: priceTargets.stopLoss,
          bullTarget: priceTargets.bullTarget,
          shares,
          riskPerShare,
          totalRisk,
          potentialGain,
          riskRewardRatio,
          percentOfCapital,
        })
      }
    }
  }

  const fetchDecision = async (symbol: string, silent = false) => {
    const trimmed = symbol?.trim()
    if (!trimmed) {
      setData(null)
      setCurrentSymbol(null)
      setError(null)
      setLoading(false)
      return
    }

    try {
      if (!silent) {
        setLoading(true)
        setError(null)
        setData(null)
      }

      const res = await api.get(
        `/api/v1/decision-support/market/decision/${trimmed}`,
      )

      const decisionData = res.data.data
      setData(decisionData)
      setCurrentSymbol(trimmed)

      // Auto-calculate position size
      if (decisionData?.priceTargets && decisionData?.priceState?.current) {
        calculateSizing(
          trimmed,
          capitalInputRef.current,
          decisionData.priceTargets,
          decisionData.priceState.current,
        )
      }
    } catch (err) {
      if (!silent) {
        console.warn(
          `[MarketAnalysis] fetchDecision failed for ${trimmed}:`,
          err,
        )
        setError('No data found for this symbol')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // Check URL query param on mount
  useEffect(() => {
    const sym = searchParams.get('symbol')
    if (sym) {
      fetchDecision(sym)
    }
  }, [searchParams])

  // Real-time polling
  React.useEffect(() => {
    if (!currentSymbol) return
    const interval = setInterval(() => {
      fetchDecision(currentSymbol, true)
    }, 10000) // 10s refresh
    return () => clearInterval(interval)
  }, [currentSymbol])

  return (
    <div className='flex h-screen flex-col overflow-hidden bg-background font-sans text-foreground lg:flex-row'>
      <Sidebar />

      <main
        id='main-content'
        className='flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8'
      >
        <div className='mx-auto max-w-[1400px] space-y-8'>
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
                Market Analysis
              </h1>
              <p className='mt-1 text-sm font-medium text-muted-foreground'>
                Precision decision support powered by Intelligence Protocols
              </p>
            </div>
          </div>

          <OrgContextBanner />

          {/* SEARCH */}
          <div className='max-w-2xl'>
            <SmartSearch onSubmit={fetchDecision} />
          </div>

          {/* STATES */}
          {loading && (
            <div className='space-y-6'>
              {/* Main Header & Chart Section Skeleton */}
              <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
                {/* Price Card & Chart Skeleton */}
                <div className='space-y-6 overflow-hidden rounded-lg border border-border bg-card p-8 shadow-lg lg:col-span-2'>
                  <div className='flex items-start justify-between'>
                    <div className='space-y-2'>
                      <div className='flex items-center gap-2'>
                        <Skeleton className='h-4 w-16 rounded' />
                        <Skeleton className='h-3 w-20 rounded' />
                      </div>
                      <Skeleton className='h-12 w-32 rounded-lg' />
                      <Skeleton className='h-3 w-40 rounded' />
                    </div>
                    <div className='flex flex-col items-end space-y-2'>
                      <Skeleton className='h-3 w-20 rounded' />
                      <Skeleton className='h-10 w-28 rounded-md' />
                      <Skeleton className='h-4 w-16 rounded' />
                    </div>
                  </div>

                  {/* Chart Placeholder Skeleton */}
                  <div className='flex h-[450px] w-full flex-col justify-between rounded-lg border border-border/50 bg-muted/20 p-6'>
                    <div className='flex items-center justify-between'>
                      <div className='flex gap-2'>
                        <Skeleton className='h-6 w-12 rounded' />
                        <Skeleton className='h-6 w-12 rounded' />
                        <Skeleton className='h-6 w-12 rounded' />
                      </div>
                      <Skeleton className='h-6 w-24 rounded' />
                    </div>
                    {/* Simulated chart wave / gridlines */}
                    <div className='w-full space-y-8 py-8'>
                      <Skeleton className='h-0.5 w-full bg-border/40' />
                      <Skeleton className='h-0.5 w-full bg-border/40' />
                      <Skeleton className='h-0.5 w-full bg-border/40' />
                      <Skeleton className='h-0.5 w-full bg-border/40' />
                    </div>
                    <div className='flex justify-between'>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className='h-3 w-10 rounded' />
                      ))}
                    </div>
                  </div>

                  <div className='flex items-center justify-between border-t border-border pt-4'>
                    <div className='flex gap-6'>
                      <Skeleton className='h-4 w-24 rounded' />
                      <Skeleton className='h-4 w-20 rounded' />
                    </div>
                    <Skeleton className='h-3 w-32 rounded' />
                  </div>
                </div>

                {/* AI Executive Decision Card Skeleton */}
                <div className='flex flex-col justify-between space-y-6 rounded-lg border border-border bg-card p-6 shadow-xl'>
                  <div>
                    <div className='mb-8 flex items-center gap-3'>
                      <Skeleton className='h-8 w-8 rounded-lg' />
                      <Skeleton className='h-4 w-28 rounded' />
                    </div>
                    <div className='mb-10 space-y-3'>
                      <Skeleton className='h-3 w-24 rounded' />
                      <Skeleton className='h-10 w-44 rounded-md' />
                      <Skeleton className='h-2 w-full rounded-full' />
                      <div className='flex justify-between'>
                        <Skeleton className='h-3 w-24 rounded' />
                        <Skeleton className='h-4 w-12 rounded' />
                      </div>
                    </div>
                    <div className='space-y-4'>
                      <div className='flex items-center gap-4'>
                        <Skeleton className='h-6 w-6 rounded-full' />
                        <div className='space-y-1'>
                          <Skeleton className='h-3 w-20 rounded' />
                          <Skeleton className='h-4 w-24 rounded' />
                        </div>
                      </div>
                      <div className='w-full border-t border-border/50' />
                      <div className='space-y-2'>
                        <Skeleton className='h-3 w-28 rounded' />
                        <Skeleton className='h-4 w-3/4 rounded' />
                        <Skeleton className='h-4 w-2/3 rounded' />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Analytics Grid Skeleton */}
              <div className='grid grid-cols-1 gap-6 md:grid-cols-3'>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className='space-y-4 rounded-lg border border-border bg-card p-8'
                  >
                    <div className='mb-4 flex items-center gap-3'>
                      <Skeleton className='h-6 w-6 rounded-full' />
                      <Skeleton className='h-3.5 w-32 rounded' />
                    </div>
                    <Skeleton className='h-9 w-20 rounded-md' />
                    <Skeleton className='h-4 w-28 rounded' />
                    <Skeleton className='h-3 w-full rounded' />
                    <Skeleton className='h-3 w-4/5 rounded' />
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className='flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-red-400'>
              <FiInfo className='text-xl' />
              <span className='font-semibold'>{error}</span>
            </div>
          )}

          {/* DATA */}
          {data && (
            <div className='space-y-6 duration-700 animate-in fade-in slide-in-from-bottom-4'>
              {/* Main Header & Chart Section */}
              <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
                {/* Price Card & Chart */}
                <div className='overflow-hidden rounded-lg border border-border bg-card shadow-lg transition-all duration-300 lg:col-span-2'>
                  <div className='flex items-start justify-between p-8'>
                    <div>
                      <div className='mb-3 flex items-center gap-2'>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            data.marketContext.marketStatus === 'OPEN'
                              ? 'border border-green-500/20 bg-green-500/10 text-green-500'
                              : 'border border-border bg-muted text-muted-foreground'
                          }`}
                        >
                          {data.marketContext.marketStatus}
                        </span>
                        <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                          Market Status
                        </span>
                      </div>
                      <h2 className='mb-1 text-5xl font-bold italic tracking-tight'>
                        {data.symbol}
                      </h2>
                      <p className='text-[10px] font-bold uppercase leading-none tracking-widest text-muted-foreground'>
                        {data.symbol} Stock Analysis
                      </p>
                    </div>

                    <div className='text-right'>
                      <div className='mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                        Current Price
                      </div>
                      <div className='text-4xl font-bold tracking-tight text-foreground'>
                        {data.priceState.current.toLocaleString()}
                      </div>
                      <div
                        className={`mt-2 flex items-center justify-end text-sm font-bold ${data.priceState.trend === 'UP' ? 'text-green-500' : 'text-destructive'}`}
                      >
                        {data.priceState.trend === 'UP' ? (
                          <FiTrendingUp className='mr-1.5' />
                        ) : (
                          <FiTrendingDown className='mr-1.5' />
                        )}
                        {data.priceState.trend}
                      </div>
                    </div>
                  </div>

                  {/* Chart Area */}
                  <div className='h-[450px] w-full px-2 pb-2'>
                    <TradingViewWidget symbol={data.symbol} theme={theme} />
                  </div>

                  <div className='flex items-center justify-between border-t border-border bg-muted/20 px-8 py-4'>
                    <div className='flex items-center gap-6'>
                      <div className='flex flex-col'>
                        <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                          Prev Close
                        </span>
                        <span className='text-xs font-bold'>
                          {data.marketContext.lastClosePrice}
                        </span>
                      </div>
                      <div className='h-6 w-px bg-border' />
                      <div className='flex flex-col'>
                        <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                          RSI (14)
                        </span>
                        <span
                          className={`text-xs font-bold ${data.priceState.isOverbought ? 'text-destructive' : 'text-primary'}`}
                        >
                          {data.priceState.rsi}
                        </span>
                      </div>
                      {data.atr && (
                        <>
                          <div className='h-6 w-px bg-border' />
                          <div className='flex flex-col'>
                            <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                              ATR (14)
                            </span>
                            <span className='text-xs font-bold text-primary'>
                              ±${data.atr.toFixed(2)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                    <div className='text-[10px] font-medium italic text-muted-foreground opacity-60'>
                      Updated: {new Date(data.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                {/* AI Executive Decision Card */}
                <div className='flex flex-col justify-between rounded-lg border border-border bg-card p-6 shadow-xl'>
                  <div>
                    <div className='mb-8 flex items-center gap-3'>
                      <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                        <FiZap className='text-lg' />
                      </div>
                      <span className='text-[10px] font-bold uppercase tracking-widest text-primary'>
                        AI Signal Pulse
                      </span>
                    </div>

                    <div className='mb-8'>
                      <span className='mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                        Recommendation
                      </span>
                      <h3 className='mb-4 text-4xl font-bold uppercase italic tracking-tight decoration-primary/30 underline-offset-8'>
                        {data.decision.recommendation}
                      </h3>
                      <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted'>
                        <div
                          className='h-full bg-primary transition-all duration-1000'
                          style={{
                            width: `${data.decision.confidence * 100}%`,
                          }}
                        />
                      </div>
                      <div className='mt-3 flex items-center justify-between'>
                        <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                          Confidence Level
                        </span>
                        <span className='text-sm font-bold text-primary'>
                          {(data.decision.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    {/* Price Targets Section */}
                    {data.priceTargets && (
                      <div className='mb-8 space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4'>
                        <span className='block text-[10px] font-black uppercase tracking-widest text-primary'>
                          Standard Price Targets
                        </span>

                        <div className='space-y-2'>
                          <div className='flex items-center justify-between text-xs'>
                            <span className='text-[10px] font-bold uppercase text-muted-foreground'>
                              Entry Range
                            </span>
                            <span className='font-mono font-bold'>
                              ${data.priceTargets.entryLow.toFixed(2)} – $
                              {data.priceTargets.entryHigh.toFixed(2)}
                            </span>
                          </div>

                          <div className='flex items-center justify-between text-xs'>
                            <span className='text-[10px] font-bold uppercase text-emerald-500'>
                              Target Price (Upside)
                            </span>
                            <span className='font-mono font-bold text-emerald-500'>
                              ${data.priceTargets.bullTarget.toFixed(2)}
                            </span>
                          </div>

                          <div className='flex items-center justify-between text-xs'>
                            <span className='text-[10px] font-bold uppercase text-rose-500'>
                              Safety Stop-Loss (Downside)
                            </span>
                            <span className='font-mono font-bold text-rose-500'>
                              ${data.priceTargets.stopLoss.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className='space-y-4'>
                      <div className='flex items-center gap-4'>
                        <FiClock className='text-lg text-muted-foreground' />
                        <div>
                          <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                            Time Horizon
                          </p>
                          <p className='text-xs font-bold'>
                            {data.decision.timeHorizon}
                          </p>
                        </div>
                      </div>
                      <div className='w-full border-t border-dashed border-border/50' />
                      <div className='space-y-3'>
                        <p className='flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                          <FiTarget className='text-primary' /> Action Guidance
                        </p>
                        <div className='space-y-2 pl-6'>
                          {data.actionGuidance.buyWindow && (
                            <div className='text-xs font-bold text-green-500'>
                              <span className='mr-1 font-medium uppercase tracking-tighter text-muted-foreground'>
                                BUY:
                              </span>{' '}
                              {data.actionGuidance.buyWindow}
                            </div>
                          )}
                          {data.actionGuidance.holdWindow && (
                            <div className='text-xs font-bold text-amber-500'>
                              <span className='mr-1 font-medium uppercase tracking-tighter text-muted-foreground'>
                                HOLD:
                              </span>{' '}
                              {data.actionGuidance.holdWindow}
                            </div>
                          )}
                          {data.actionGuidance.sellWindow && (
                            <div className='text-xs font-bold text-destructive'>
                              <span className='mr-1 font-medium uppercase tracking-tighter text-muted-foreground'>
                                SELL:
                              </span>{' '}
                              {data.actionGuidance.sellWindow}
                            </div>
                          )}
                          {data.actionGuidance.watchFor && (
                            <div className='text-[11px] font-bold italic text-blue-500'>
                              "Watch {data.actionGuidance.watchFor}"
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Collapsible Size My Position Panel */}
              {data.priceTargets && (
                <div className='overflow-hidden rounded-2xl border border-border bg-card shadow-lg transition-all duration-300'>
                  <button
                    type='button'
                    onClick={() => setIsSizerOpen(!isSizerOpen)}
                    className='flex w-full items-center justify-between bg-muted/20 px-8 py-5 transition-colors hover:bg-muted/30'
                  >
                    <div className='flex items-center gap-3'>
                      <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                        <FiSliders className='text-base' />
                      </div>
                      <div className='text-left'>
                        <h3 className='text-base font-black tracking-tight'>
                          Size My Position &amp; Trade Plan
                        </h3>
                        <p className='text-xs font-medium text-muted-foreground'>
                          Interactive capital allocation and standardized
                          ATR-based trade parameters
                        </p>
                      </div>
                    </div>
                    {isSizerOpen ? (
                      <FiChevronUp className='text-lg text-muted-foreground' />
                    ) : (
                      <FiChevronDown className='text-lg text-muted-foreground' />
                    )}
                  </button>

                  {isSizerOpen && (
                    <div className='space-y-6 border-t border-border p-8 duration-300 animate-in fade-in'>
                      <div className='grid grid-cols-1 items-end gap-6 md:grid-cols-12'>
                        <div className='space-y-2 md:col-span-6'>
                          <label className='flex justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground'>
                            <span>Allocation Budget ($ USD)</span>
                            <span className='font-mono text-primary'>
                              ${capitalInput.toLocaleString()}
                            </span>
                          </label>
                          <div className='relative'>
                            <div className='pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground'>
                              <FiDollarSign />
                            </div>
                            <Input
                              type='number'
                              value={capitalInput}
                              onChange={(e) => {
                                const val = Math.max(
                                  1,
                                  Number(e.target.value) || 0,
                                )
                                setCapitalInput(val)
                                calculateSizing(
                                  data.symbol,
                                  val,
                                  data.priceTargets,
                                  data.priceState.current,
                                )
                              }}
                              min={100}
                              max={10000000}
                              step={500}
                              className='border-border bg-background pl-9 text-sm font-bold'
                            />
                          </div>
                        </div>

                        <div className='flex justify-end md:col-span-6'>
                          <Button
                            onClick={() => {
                              if (sizingResult && data.priceTargets) {
                                downloadTradePlanPdf({
                                  symbol: data.symbol,
                                  currentPrice: data.priceState.current,
                                  atr: data.atr,
                                  recommendation: data.decision.recommendation,
                                  confidence: data.decision.confidence,
                                  timeHorizon: data.decision.timeHorizon,
                                  entryRange: {
                                    low: data.priceTargets.entryLow,
                                    high: data.priceTargets.entryHigh,
                                  },
                                  bullTarget: data.priceTargets.bullTarget,
                                  stopLoss: data.priceTargets.stopLoss,
                                  riskFlags: data.riskFlags,
                                  sizing: sizingResult,
                                })
                                toast.success(
                                  `Trade Plan PDF generated for ${data.symbol}`,
                                )
                              }
                            }}
                            className='flex items-center gap-2 bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90'
                          >
                            <FiDownload size={14} /> Download Trade Plan (PDF)
                          </Button>
                        </div>
                      </div>

                      {sizingResult && (
                        <div className='grid grid-cols-2 gap-4 pt-2 sm:grid-cols-4'>
                          <div className='space-y-1 rounded-xl border border-border bg-background p-4'>
                            <span className='flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                              <FiAward className='text-primary' /> Units
                            </span>
                            <div className='text-2xl font-black text-primary'>
                              {sizingResult.shares} shares
                            </div>
                            <span className='text-[10px] font-medium text-muted-foreground'>
                              Allocated
                            </span>
                          </div>

                          <div className='space-y-1 rounded-xl border border-border bg-background p-4'>
                            <span className='flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                              <FiShield className='text-rose-500' /> Max Risk
                            </span>
                            <div className='text-2xl font-black text-rose-500'>
                              ${sizingResult.totalRisk.toLocaleString()}
                            </div>
                            <span className='text-[10px] font-medium text-rose-400'>
                              -${sizingResult.riskPerShare.toFixed(2)}/sh
                            </span>
                          </div>

                          <div className='space-y-1 rounded-xl border border-border bg-background p-4'>
                            <span className='flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                              <FiTarget className='text-emerald-500' />{' '}
                              Potential Gain
                            </span>
                            <div className='text-2xl font-black text-emerald-500'>
                              +${sizingResult.potentialGain.toLocaleString()}
                            </div>
                            <span className='text-[10px] font-medium text-emerald-400'>
                              to Target
                            </span>
                          </div>

                          <div className='space-y-1 rounded-xl border border-border bg-background p-4'>
                            <span className='flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                              <FiActivity className='text-primary' /> R : R
                              Ratio
                            </span>
                            <div className='text-2xl font-black text-foreground'>
                              {sizingResult.riskRewardRatio.toFixed(2)} : 1
                            </div>
                            <span className='text-[10px] font-medium text-muted-foreground'>
                              {sizingResult.percentOfCapital.toFixed(1)}%
                              capital
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Analytics Grid */}
              <div className='grid grid-cols-1 gap-6 md:grid-cols-3'>
                {/* Analyst Consensus */}
                <div className='group rounded-lg border border-border bg-card p-8 transition-all duration-300 hover:border-border/80'>
                  <div className='mb-6 flex items-center gap-3'>
                    <FiUsers className='text-lg text-primary' />
                    <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                      Analyst Consensus
                    </span>
                  </div>
                  <div className='mb-2 text-4xl font-bold tracking-tight text-primary'>
                    {data.analystConsensus.confidencePercent}%
                  </div>
                  <div className='mb-2 text-base font-bold uppercase italic tracking-wide'>
                    {data.analystConsensus.rating}
                  </div>
                  <p className='text-xs font-medium leading-relaxed text-muted-foreground'>
                    Aggregate sentiment based on{' '}
                    <span className='font-bold text-foreground'>
                      {data.analystConsensus.sourceCount} professional analysts
                    </span>
                    .
                  </p>
                </div>

                {/* Market Indicators / Sentiment */}
                <div className='group rounded-lg border border-border bg-card p-8 transition-all duration-300 hover:border-border/80'>
                  <div className='mb-6 flex items-center gap-3'>
                    <FiActivity className='text-lg text-primary' />
                    <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                      Sentiment Engine
                    </span>
                  </div>

                  <div className='grid grid-cols-2 gap-y-6'>
                    <div>
                      <p className='mb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                        Score
                      </p>
                      <p className='text-xl font-bold'>
                        {data.sentimentState.score.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className='mb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                        Trend
                      </p>
                      <p className='text-xl font-bold uppercase italic text-primary'>
                        {data.sentimentState.trend}
                      </p>
                    </div>
                    <div>
                      <p className='mb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                        48H Change
                      </p>
                      <p
                        className={`text-xl font-bold ${data.sentimentState.change48hPercent >= 0 ? 'text-green-500' : 'text-destructive'}`}
                      >
                        {data.sentimentState.change48hPercent}%
                      </p>
                    </div>
                    <div>
                      <p className='mb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                        Buzz Volume
                      </p>
                      <p className='text-xl font-bold'>
                        {data.sentimentState.newsVolume}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Reasoning Detail */}
                <div className='group rounded-lg border border-border bg-card p-8 transition-all duration-300 hover:border-border/80'>
                  <div className='mb-6 flex items-center gap-3'>
                    <FiInfo className='text-lg text-primary' />
                    <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                      Intelligence Brief
                    </span>
                  </div>
                  <ul className='space-y-4'>
                    {data.reasoning.details &&
                    data.reasoning.details.length > 0 ? (
                      data.reasoning.details.map((detail: string) => (
                        <li key={detail} className='flex items-start gap-4'>
                          <div className='mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary' />
                          <span className='text-xs font-medium leading-relaxed tracking-wide text-muted-foreground'>
                            {detail}
                          </span>
                        </li>
                      ))
                    ) : (
                      <div className='flex flex-col items-center gap-3 py-4 text-xs font-bold italic text-muted-foreground opacity-60'>
                        <FiInfo className='text-lg' />
                        <span>Streaming real-time logic...</span>
                      </div>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default MarketAnalysis
