import { AnnouncementAnchor, anchorProps } from '@/modules/announcements'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import api from '@/shared/api/axios'
import { ConfirmationModal } from '@/shared/components/ConfirmationModal'
import { Sidebar } from '@/shared/components/Sidebar'
import { SmartSearch } from '@/shared/components/SmartSearch'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/shared/components/ui/avatar'
import { Badge as ShadcnBadge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton as ShadcnSkeleton } from '@/shared/components/ui/skeleton'
import { useSocket } from '@/shared/hooks/useSocket'
import { useTheme } from '@/shared/hooks/useTheme'
import { useFocusTrap } from '@/shared/hooks/useFocusTrap'
import { preloader } from '@/shared/utils/preloader'
import React, { useEffect, useRef, useState } from 'react'
import {
  FiActivity,
  FiAlertCircle,
  FiBell,
  FiCheckCircle,
  FiDollarSign,
  FiEdit2,
  FiInfo,
  FiMessageSquare,
  FiPlus,
  FiTrash2,
  FiTrendingDown,
  FiTrendingUp,
  FiUpload,
} from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import type { Alert, WatchlistItem } from '../types'

// --- Components ---

const Badge = ({
  children,
  color = 'cyan',
}: {
  children: React.ReactNode
  color?: string
}) => {
  const colors: any = {
    cyan: 'bg-primary/10 text-primary border-primary/20',
    red: 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10',
    green:
      'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/10',
    yellow:
      'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/10',
    gray: 'bg-muted text-muted-foreground border-border hover:bg-muted',
  }
  return (
    <ShadcnBadge
      variant='outline'
      className={`px-2 py-0.5 text-[10px] font-bold ${colors[color]}`}
    >
      {children}
    </ShadcnBadge>
  )
}

const Skeleton = ({ className }: { className?: string }) => (
  <ShadcnSkeleton className={className} />
)

const formatNumber = (val: number | null, prefix = '', suffix = '') => {
  if (val === null || val === undefined) return '—'
  return `${prefix}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`
}

const Watchlist: React.FC = () => {
  const { theme } = useTheme()
  const { can } = useAuth()
  const { connected, subscribe, unsubscribe, getTradeMap } = useSocket(true)
  const tradeMap = getTradeMap()
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<WatchlistItem | null>(null)
  const [expandedBasis, setExpandedBasis] = useState<string | null>(null)

  // Alert management state
  const [showAlertModal, setShowAlertModal] = useState(false)
  const [currentAlerts, setCurrentAlerts] = useState<Alert[]>([])
  const [loadingAlerts, setLoadingAlerts] = useState(false)
  const [newAlertType, setNewAlertType] = useState<Alert['type']>('PRICE_ABOVE')

  // Confirmation states
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null)

  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [symbolToRemove, setSymbolToRemove] = useState<string | null>(null)

  const [showAlertDeleteModal, setShowAlertDeleteModal] = useState(false)
  const [alertToDelete, setAlertToDelete] = useState<{
    symbol: string
    id: string
  } | null>(null)

  // Edit entry state
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null)

  const editModalRef = useRef<HTMLDivElement>(null)
  const addModalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(editModalRef, showEditModal, () => setShowEditModal(false))
  useFocusTrap(addModalRef, showAddModal, () => setShowAddModal(false))

  const [newTickerSymbol, setNewTickerSymbol] = useState('')

  useEffect(() => {
    fetchWatchlist()
  }, [])

  useEffect(() => {
    if (connected && watchlist.length > 0) {
      watchlist.forEach((item) => {
        subscribe(item.symbol)
      })
      return () => {
        watchlist.forEach((item) => {
          unsubscribe(item.symbol)
        })
      }
    }
  }, [connected, watchlist, subscribe, unsubscribe])

  const fetchWatchlist = async () => {
    try {
      setLoading(watchlist.length === 0)
      const res = await preloader.get<{
        success: boolean
        data: WatchlistItem[]
      }>('/api/v1/watchlist')
      if (res?.success && Array.isArray(res.data)) {
        setWatchlist(res.data)
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to fetch watchlist')
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (symbol: string) => {
    setSymbolToRemove(symbol)
    setShowRemoveModal(true)
  }

  const executeRemove = async () => {
    if (!symbolToRemove) return
    const symbol = symbolToRemove
    const previousWatchlist = [...watchlist]

    // Optimistic removal
    setWatchlist((prev) => prev.filter((item) => item.symbol !== symbol))
    setShowRemoveModal(false)
    setSymbolToRemove(null)

    try {
      await api.delete(`/api/v1/watchlist/${symbol}`)
      preloader.invalidate('/api/v1/watchlist')
      toast.success(`${symbol} removed`)
      unsubscribe(symbol)
    } catch (err: any) {
      // Rollback on error
      setWatchlist(previousWatchlist)
      toast.error('Failed to remove item')
    }
  }

  const handleConvertToPosition = async (symbol: string) => {
    setConfirmTarget(symbol)
    setShowConfirmModal(true)
  }

  const executeConversion = async () => {
    if (!confirmTarget) return
    const symbol = confirmTarget
    const previousWatchlist = [...watchlist]

    // Optimistic removal
    setWatchlist((prev) => prev.filter((item) => item.symbol !== symbol))
    setConfirmTarget(null)

    try {
      await api.post(`/api/v1/watchlist/${symbol}/convert-to-position`, {})
      toast.success(`${symbol} successfully converted to portfolio position`)
      preloader.invalidate('/api/v1/watchlist')
      unsubscribe(symbol)
      // Refetch entire watchlist for metrics updates
      fetchWatchlist()
    } catch (err: any) {
      setWatchlist(previousWatchlist)
      toast.error(err.response?.data?.message || 'Conversion failed')
    }
  }

  const handleUpdateEntry = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingItem) return

    const formData = new FormData(e.currentTarget)
    const data = {
      targetEntryPrice: parseFloat(formData.get('targetEntryPrice') as string),
      stopLoss: parseFloat(formData.get('stopLoss') as string),
      notes: formData.get('notes') as string,
    }

    if (data.stopLoss >= data.targetEntryPrice) {
      toast.error('Stop-loss must be lower than target entry price')
      return
    }

    try {
      await api.patch(`/api/v1/watchlist/${editingItem.symbol}`, data)
      preloader.invalidate('/api/v1/watchlist')
      toast.success(`Updated ${editingItem.symbol}`)
      setShowEditModal(false)
      fetchWatchlist()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Update failed')
    }
  }

  const openAlerts = async (symbol: string) => {
    setSelectedItem(watchlist.find((i) => i.symbol === symbol) || null)
    setShowAlertModal(true)
    setLoadingAlerts(true)
    try {
      const res = await preloader.get<{ success: boolean; data: Alert[] }>(
        `/api/v1/watchlist/${symbol}/alerts`,
      )
      if (res?.success) {
        setCurrentAlerts(res.data)
      }
    } catch (err) {
      toast.error('Failed to fetch alerts')
    } finally {
      setLoadingAlerts(false)
    }
  }

  return (
    <div className='flex h-screen flex-col overflow-hidden bg-background text-foreground lg:flex-row'>
      <Sidebar />

      <main
        id='main-content'
        className='flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8'
      >
        {/* Header */}
        <div className='mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
              Market Watchlist
            </h1>
            <p className='mt-1 text-sm font-medium text-muted-foreground'>
              Monitor high-conviction setups and AI insights.
            </p>
          </div>
          <Button
            onClick={() => setShowAddModal(true)}
            className='flex items-center gap-2'
            {...anchorProps(AnnouncementAnchor.WATCHLIST_ADD)}
          >
            <FiPlus /> Add Ticker
          </Button>
        </div>

        {/* Watchlist Table/Cards */}
        <div className='space-y-4'>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className='rounded-lg border border-border bg-card p-4 shadow-sm md:p-6'
              >
                <div className='flex flex-col gap-4 md:gap-6 lg:grid lg:grid-cols-[1.2fr_1fr_4.5fr_1fr]'>
                  {/* Column 1: Symbol & Price */}
                  <div className='flex items-start gap-4'>
                    <Skeleton className='h-12 w-12 shrink-0 rounded-full' />
                    <div className='flex-1 space-y-2'>
                      <div className='flex items-center gap-2'>
                        <Skeleton className='h-5 w-20 rounded' />
                        <Skeleton className='h-4 w-16 rounded-full' />
                      </div>
                      <Skeleton className='h-7 w-28 rounded-md' />
                      <Skeleton className='h-4 w-36 rounded' />
                    </div>
                  </div>

                  {/* Column 2: Portfolio Fit */}
                  <div className='flex flex-col justify-center space-y-2 border-t border-border pt-4 lg:border-l-2 lg:border-t-0 lg:pl-8 lg:pt-0'>
                    <Skeleton className='h-3 w-20 rounded' />
                    <Skeleton className='h-10 w-full rounded-lg' />
                  </div>

                  {/* Column 3: Strategy & AI Targets */}
                  <div className='grid grid-cols-1 gap-4 border-t border-border pt-4 md:grid-cols-2 lg:gap-6 lg:border-l-2 lg:border-t-0 lg:pl-6 lg:pt-0'>
                    <div className='space-y-3'>
                      <Skeleton className='h-3 w-24 rounded' />
                      <div className='flex items-center gap-4'>
                        <div className='flex-1 space-y-1.5'>
                          <Skeleton className='h-3 w-12 rounded' />
                          <Skeleton className='h-5 w-16 rounded' />
                        </div>
                        <Skeleton className='h-8 w-1.5 rounded-full' />
                        <div className='flex-1 space-y-1.5'>
                          <Skeleton className='h-3 w-14 rounded' />
                          <Skeleton className='h-5 w-16 rounded' />
                        </div>
                      </div>
                    </div>
                    <div className='space-y-3'>
                      <Skeleton className='h-3 w-24 rounded' />
                      <div className='flex items-center gap-4'>
                        <div className='flex-1 space-y-1.5'>
                          <Skeleton className='h-3 w-12 rounded' />
                          <Skeleton className='h-5 w-16 rounded' />
                        </div>
                        <Skeleton className='h-8 w-1.5 rounded-full' />
                        <div className='flex-1 space-y-1.5'>
                          <Skeleton className='h-3 w-14 rounded' />
                          <Skeleton className='h-5 w-16 rounded' />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 4: Actions */}
                  <div className='flex flex-row justify-center gap-2 border-t border-border pt-4 lg:flex-col lg:border-l-2 lg:border-t-0 lg:pl-10 lg:pt-0'>
                    <Skeleton className='h-9 w-full rounded-lg' />
                    <div className='flex justify-end gap-2 lg:justify-center'>
                      <Skeleton className='h-8 w-8 rounded-md' />
                      <Skeleton className='h-8 w-8 rounded-md' />
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : watchlist.length === 0 ? (
            <div className='rounded-lg border border-dashed border-border bg-card py-20 text-center'>
              <FiActivity className='mx-auto mb-4 text-5xl text-muted-foreground' />
              <p className='text-muted-foreground'>
                Your watchlist is empty. Add a symbol to get started.
              </p>
            </div>
          ) : (
            watchlist.map((item) => (
              <div
                key={item.symbol}
                className={`group rounded-lg border bg-card p-4 transition-all duration-300 md:p-6 ${
                  item.stopLossBreached
                    ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.1)]'
                    : 'border-border hover:border-border/80 hover:shadow-lg hover:shadow-primary/5'
                }`}
              >
                <div className='flex flex-col gap-4 md:gap-6 lg:grid lg:grid-cols-[1.2fr_1fr_4.5fr_1fr]'>
                  {/* Symbol & Market Data */}
                  <div className='flex items-start gap-4'>
                    <Avatar className='h-12 w-12 border border-border'>
                      {item.logo && (
                        <AvatarImage
                          src={item.logo}
                          alt={item.symbol}
                          className='object-cover'
                        />
                      )}
                      <AvatarFallback className='bg-muted text-xl font-bold text-foreground'>
                        {item.symbol[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className='flex items-center gap-2'>
                        <span className='text-xl font-bold text-foreground'>
                          {item.symbol}
                        </span>
                        {item.entryZone && (
                          <Badge color='green'>ENTRY ZONE</Badge>
                        )}
                        {item.stopLossBreached && (
                          <Badge color='red'>SL BREACHED</Badge>
                        )}
                        {connected &&
                          tradeMap.has(item.symbol.toUpperCase()) && (
                            <div className='ml-1 flex items-center gap-1.5'>
                              <div className='h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500' />
                              <span className='text-[10px] font-bold text-cyan-500'>
                                LIVE
                              </span>
                            </div>
                          )}
                      </div>
                      <div className='mt-1 flex flex-col'>
                        <span className='text-2xl font-semibold'>
                          {formatNumber(
                            tradeMap.get(item.symbol.toUpperCase())?.p ??
                              item.currentPrice,
                            '$',
                          )}
                        </span>
                        <div className='flex items-center gap-2 text-sm'>
                          <span
                            className={
                              item.changePercent && item.changePercent >= 0
                                ? 'text-emerald-500'
                                : 'text-red-500'
                            }
                          >
                            {item.changePercent && item.changePercent >= 0 ? (
                              <FiTrendingUp className='mr-1 inline' />
                            ) : (
                              <FiTrendingDown className='mr-1 inline' />
                            )}
                            {formatNumber(item.changePercent, '', '%')}
                          </span>
                          <span className='text-muted-foreground'>|</span>
                          <span
                            className={`flex items-center gap-1 ${item.priceSinceAdded && item.priceSinceAdded >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
                          >
                            {item.priceSinceAdded && item.priceSinceAdded >= 0
                              ? '+'
                              : ''}
                            {formatNumber(item.priceSinceAdded, '', '%')}{' '}
                            (Added)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Portfolio Fit & Exposure */}
                  <div
                    className={`flex flex-col justify-center border-t border-border pt-4 lg:border-l-2 lg:border-t-0 lg:pl-8 lg:pt-0`}
                  >
                    <div className='mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>
                      Portfolio Fit
                    </div>
                    {item.portfolioFit ? (
                      <div
                        className={`flex gap-3 rounded-lg p-3 text-sm font-medium transition-colors duration-300 ${item.portfolioFit.overexposureWarning ? 'border border-red-500/20 bg-red-500/10 text-red-500' : 'border border-cyan-500/10 bg-cyan-500/5 text-cyan-600'}`}
                      >
                        {item.portfolioFit.overexposureWarning ? (
                          <FiAlertCircle className='mt-0.5 shrink-0' />
                        ) : (
                          <FiCheckCircle className='mt-0.5 shrink-0' />
                        )}
                        <span>{item.portfolioFit.message}</span>
                      </div>
                    ) : (
                      <Link
                        to='/decision-support/portfolio-health'
                        className='flex items-center gap-1 text-[10px] font-bold text-cyan-500 underline hover:text-cyan-400'
                      >
                        <FiUpload className='text-xs' /> Upload Portfolio for
                        Analysis
                      </Link>
                    )}
                  </div>{' '}
                  {/* Strategy Column: User Plan & AI Analysis */}
                  <div
                    className={`grid grid-cols-1 gap-4 border-t border-border pt-6 md:grid-cols-2 lg:gap-6 lg:border-l-2 lg:border-t-0 lg:pl-6 lg:pt-0`}
                  >
                    {/* USER STRATEGY - Stable 2-column grid */}
                    <div className='min-w-0 space-y-3'>
                      <div className='flex items-center gap-1.5 whitespace-nowrap text-[10px] font-black uppercase tracking-widest text-gray-500'>
                        <span className='text-cyan-500'>+</span> MY STRATEGY
                      </div>

                      <div className='flex items-center gap-4'>
                        <div className='flex-1'>
                          <p className='mb-1 whitespace-nowrap text-[9px] font-bold uppercase tracking-wider text-gray-400 opacity-80'>
                            Targets
                          </p>
                          <div className='flex flex-col gap-1'>
                            {item.targetEntryPrice ? (
                              <p className='text-sm font-bold leading-snug'>
                                {formatNumber(item.targetEntryPrice, '$')}
                              </p>
                            ) : (
                              <p className='text-sm font-black leading-snug text-gray-800'>
                                —
                              </p>
                            )}
                            {item.alerts
                              ?.filter(
                                (a) =>
                                  a.type === 'PRICE_ABOVE' &&
                                  a.isActive &&
                                  a.threshold !== item.targetEntryPrice,
                              )
                              .map((alert) => (
                                <p
                                  key={alert.id}
                                  className='text-[10px] font-bold leading-tight text-muted-foreground'
                                >
                                  {formatNumber(alert.threshold, '$')}
                                </p>
                              ))}
                          </div>
                        </div>

                        <div
                          className={`h-8 w-1.5 shrink-0 rounded-full ${theme === 'dark' ? 'bg-white/40' : 'bg-gray-500'}`}
                        />

                        <div className='flex-1'>
                          <p className='mb-1 whitespace-nowrap text-[9px] font-bold uppercase tracking-wider text-muted-foreground opacity-80'>
                            Stop Loss
                          </p>
                          <div className='flex flex-col gap-1'>
                            {item.stopLoss ? (
                              <p className='text-sm font-black leading-snug text-red-500/90'>
                                {formatNumber(item.stopLoss, '$')}
                              </p>
                            ) : (
                              <p className='text-sm font-bold leading-snug text-muted-foreground'>
                                —
                              </p>
                            )}
                            {item.alerts
                              ?.filter(
                                (a) =>
                                  a.type === 'PRICE_BELOW' &&
                                  a.isActive &&
                                  a.threshold !== item.stopLoss,
                              )
                              .map((alert) => (
                                <p
                                  key={alert.id}
                                  className='text-[10px] font-bold leading-tight text-red-500/50'
                                >
                                  {formatNumber(alert.threshold, '$')}
                                </p>
                              ))}
                          </div>
                        </div>
                      </div>

                      {item.notes && (
                        <div className='flex items-start gap-2 border-t border-white/5 pt-1.5 opacity-60'>
                          <FiMessageSquare className='mt-0.5 shrink-0 text-[9px] text-gray-500' />
                          <p className='line-clamp-1 text-[10px] italic leading-snug text-gray-500'>
                            {item.notes}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* AI STRATEGY - Stable 2-column grid */}
                    <div
                      className={`min-w-0 space-y-3 border-t border-border pt-6 md:border-l-2 md:border-t-0 md:pl-6 md:pt-0`}
                    >
                      <div className='flex items-center gap-1.5 whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>
                        <span className='h-1.5 w-1.5 rounded-full bg-cyan-500/80'></span>
                        AI Suggested
                      </div>

                      <div className='space-y-4'>
                        {/* Top Row Grid */}
                        <div className='flex items-center gap-4'>
                          <div className='flex-1'>
                            <p className='mb-1 whitespace-nowrap text-[9px] font-bold uppercase tracking-wider text-muted-foreground opacity-80'>
                              Entry
                            </p>
                            <p
                              className={`text-sm font-black leading-snug ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}`}
                            >
                              {formatNumber(
                                item.aiSuggested?.entry ?? null,
                                '$',
                              )}
                            </p>
                          </div>

                          <div
                            className={`h-8 w-1.5 shrink-0 rounded-full ${theme === 'dark' ? 'bg-white/40' : 'bg-gray-500'}`}
                          />

                          <div className='flex-1'>
                            <p className='mb-1 whitespace-nowrap text-[9px] font-bold uppercase tracking-wider text-muted-foreground opacity-80'>
                              Exit (TP)
                            </p>
                            <p
                              className={`text-sm font-black leading-snug ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`}
                            >
                              {formatNumber(
                                item.aiSuggested?.takeProfit ?? null,
                                '$',
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Bottom Row Grid: Risk & Confidence */}
                        <div className='flex items-center gap-4'>
                          <div className='flex-1'>
                            <p className='mb-1 whitespace-nowrap text-[9px] font-bold uppercase tracking-wider text-muted-foreground opacity-80'>
                              Risk (SL)
                            </p>
                            <p
                              className={`text-sm font-black leading-snug ${theme === 'dark' ? 'text-orange-400' : 'text-orange-600'}`}
                            >
                              {formatNumber(
                                item.aiSuggested?.stopLoss ?? null,
                                '$',
                              )}
                            </p>
                          </div>
                          <div className='pt-2'>
                            {item.aiSuggested && (
                              <span
                                className={`rounded border bg-white/5 px-1.5 py-0.5 text-[8px] font-black ${
                                  item.aiSuggested.confidence === 'HIGH'
                                    ? 'border-emerald-400/20 text-emerald-400'
                                    : item.aiSuggested.confidence === 'MEDIUM'
                                      ? 'border border-amber-400/20 text-amber-400'
                                      : 'border border-red-400/20 text-red-400'
                                }`}
                              >
                                {item.aiSuggested.confidence}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action Row: Basis Button */}
                        {item.aiSuggested ? (
                          <div className='pt-1'>
                            <button
                              onClick={() =>
                                setExpandedBasis(
                                  expandedBasis === item.symbol
                                    ? null
                                    : item.symbol,
                                )
                              }
                              className='group flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 shadow-sm transition-all hover:border-cyan-500/30 hover:bg-cyan-500/20 active:scale-95'
                            >
                              <FiInfo
                                size={14}
                                className='shrink-0 text-cyan-500 transition-transform group-hover:scale-110'
                              />
                              <span className='whitespace-nowrap text-[11px] font-black uppercase tracking-widest text-cyan-500'>
                                Basis Analysis
                              </span>
                            </button>
                          </div>
                        ) : (
                          <div className='pt-1'>
                            <span className='text-[9px] font-bold uppercase tracking-widest text-muted-foreground'>
                              Awaiting Analysis
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Actions */}
                  <div className='flex flex-row items-center justify-between gap-4 border-t border-border py-2 pt-4 lg:flex-col lg:items-stretch lg:border-l-2 lg:border-t-0 lg:pl-10 lg:pt-0'>
                    <div className='flex flex-col gap-2'>
                      {can('PORTFOLIO', 'canWrite') && (
                        <button
                          onClick={() => handleConvertToPosition(item.symbol)}
                          className='flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-600 lg:whitespace-nowrap'
                        >
                          <FiDollarSign /> Buy Now
                        </button>
                      )}
                      <button
                        onClick={() => openAlerts(item.symbol)}
                        onMouseEnter={() =>
                          preloader.preload(
                            `/api/v1/watchlist/${item.symbol}/alerts`,
                          )
                        }
                        onFocus={() =>
                          preloader.preload(
                            `/api/v1/watchlist/${item.symbol}/alerts`,
                          )
                        }
                        className='flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-xs font-bold text-secondary-foreground transition hover:bg-secondary/80'
                      >
                        <FiBell /> Alerts
                      </button>
                    </div>
                    <div className='flex items-center justify-center gap-3'>
                      <button
                        onClick={() => {
                          setEditingItem(item)
                          setShowEditModal(true)
                        }}
                        className='rounded-lg bg-secondary p-2 text-muted-foreground transition hover:bg-secondary/80 hover:text-foreground'
                      >
                        <FiEdit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleRemove(item.symbol)}
                        className='rounded-lg bg-destructive/10 p-2 text-destructive transition hover:bg-destructive/20'
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded AI Basis */}
                {expandedBasis === item.symbol && item.aiSuggested && (
                  <div className='mt-6 rounded-lg border border-primary/10 bg-primary/5 p-6 duration-500 animate-in fade-in slide-in-from-top-4'>
                    <div className='flex gap-5'>
                      <div className='h-fit rounded-xl bg-primary/10 p-3 text-primary'>
                        <FiInfo size={20} />
                      </div>
                      <div className='flex-1'>
                        <div className='mb-3 flex items-center justify-between'>
                          <p className='text-sm font-bold uppercase tracking-wider'>
                            AI Logic Basis
                          </p>
                          <span className='rounded bg-primary/5 px-2 py-1 text-[10px] font-bold tracking-widest text-primary/60'>
                            LIVE ANALYSIS
                          </span>
                        </div>
                        <p className='max-w-4xl text-sm font-medium leading-relaxed text-muted-foreground'>
                          {item.aiSuggested.basis}
                        </p>
                        <div className='mt-6 flex items-center justify-between border-t border-border pt-4'>
                          <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>
                            Intelligence Protocol v4.0 • Updated:{' '}
                            {new Date(
                              item.aiSuggested.computedAt,
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>

      {/* Edit Ticker Modal */}
      {showEditModal && editingItem && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm'>
          <div
            ref={editModalRef}
            role='dialog'
            aria-modal='true'
            aria-labelledby='edit-ticker-modal-title'
            className='w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-2xl'
          >
            <h2
              id='edit-ticker-modal-title'
              className='mb-6 flex items-center gap-2 text-xl font-bold'
            >
              <FiEdit2 className='text-primary' />
              Edit {editingItem.symbol}
            </h2>
            <form onSubmit={handleUpdateEntry} className='space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label
                    htmlFor='edit-target-entry-price'
                    className='mb-1 block text-xs font-medium text-muted-foreground'
                  >
                    Target Entry Price
                  </label>
                  <input
                    id='edit-target-entry-price'
                    name='targetEntryPrice'
                    type='number'
                    step='0.01'
                    defaultValue={editingItem.targetEntryPrice || ''}
                    required
                    className='h-12 w-full rounded-lg border border-border bg-secondary px-4 outline-none transition focus:border-primary/50'
                  />
                </div>
                <div>
                  <label
                    htmlFor='edit-stop-loss'
                    className='mb-1 block text-xs font-medium text-muted-foreground'
                  >
                    Stop Loss
                  </label>
                  <input
                    id='edit-stop-loss'
                    name='stopLoss'
                    type='number'
                    step='0.01'
                    defaultValue={editingItem.stopLoss || ''}
                    required
                    className='h-12 w-full rounded-lg border border-border bg-secondary px-4 text-red-400 outline-none transition focus:border-primary/50'
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor='edit-notes'
                  className='mb-1 block text-xs font-medium text-muted-foreground'
                >
                  Notes (Optional)
                </label>
                <textarea
                  id='edit-notes'
                  name='notes'
                  defaultValue={editingItem.notes || ''}
                  placeholder='Update your strategy notes...'
                  className='h-24 w-full resize-none rounded-lg border border-border bg-secondary px-4 py-3 outline-none transition focus:border-primary/50'
                />
              </div>
              <div className='mt-4 flex gap-3'>
                <button
                  type='button'
                  onClick={() => setShowEditModal(false)}
                  className='h-12 flex-1 rounded-lg bg-secondary font-bold text-muted-foreground transition hover:bg-secondary/80'
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  className='h-12 flex-1 rounded-lg bg-primary font-bold text-primary-foreground transition hover:bg-primary/90'
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Ticker Modal */}
      {showAddModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm'>
          <div
            ref={addModalRef}
            role='dialog'
            aria-modal='true'
            aria-labelledby='add-ticker-modal-title'
            className='w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-2xl'
          >
            <h2
              id='add-ticker-modal-title'
              className='mb-6 flex items-center gap-2 text-xl font-bold'
            >
              <FiPlus className='text-primary' />
              Add New Ticker
            </h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const formData = new FormData(e.currentTarget)
                const rawData = Object.fromEntries(formData) as any
                const data = {
                  ...rawData,
                  symbol: newTickerSymbol,
                  targetEntryPrice: parseFloat(rawData.targetEntryPrice),
                  stopLoss: parseFloat(rawData.stopLoss),
                }

                if (!data.symbol) {
                  toast.error('Please select a ticker symbol')
                  return
                }

                if (data.stopLoss >= data.targetEntryPrice) {
                  toast.error('Stop-loss must be lower than target entry price')
                  return
                }

                try {
                  const response = await api.post<{
                    success: boolean
                    data: WatchlistItem
                  }>('/api/v1/watchlist', data)
                  const addedItem = response.data.data
                  setWatchlist((currentWatchlist) => [
                    addedItem,
                    ...currentWatchlist.filter(
                      (item) => item.symbol !== addedItem.symbol,
                    ),
                  ])
                  preloader.invalidate('/api/v1/watchlist')
                  toast.success(`${addedItem.symbol} added to watchlist`)
                  setShowAddModal(false)
                  setNewTickerSymbol('')
                } catch (err: any) {
                  toast.error(
                    err.response?.data?.message || 'Failed to add symbol',
                  )
                }
              }}
              className='space-y-4'
            >
              <div>
                <label
                  htmlFor='add-ticker-symbol'
                  className='mb-1 block text-xs font-medium text-muted-foreground'
                >
                  Ticker Symbol
                </label>
                <SmartSearch
                  inputId='add-ticker-symbol'
                  onSubmit={(sym) => setNewTickerSymbol(sym)}
                  placeholder='Search symbol (e.g. NVDA)'
                />
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label
                    htmlFor='add-target-entry-price'
                    className='mb-1 block text-xs font-medium text-muted-foreground'
                  >
                    Target Entry Price
                  </label>
                  <input
                    id='add-target-entry-price'
                    name='targetEntryPrice'
                    type='number'
                    step='0.01'
                    required
                    placeholder='150'
                    className='h-12 w-full rounded-lg border border-border bg-secondary px-4 outline-none transition focus:border-primary/50'
                  />
                </div>
                <div>
                  <label
                    htmlFor='add-stop-loss'
                    className='mb-1 block text-xs font-medium text-muted-foreground'
                  >
                    Stop Loss
                  </label>
                  <input
                    id='add-stop-loss'
                    name='stopLoss'
                    type='number'
                    step='0.01'
                    required
                    placeholder='140'
                    className='h-12 w-full rounded-lg border border-border bg-secondary px-4 text-red-400 outline-none transition focus:border-primary/50'
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor='add-notes'
                  className='mb-1 block text-xs font-medium text-muted-foreground'
                >
                  Notes (Optional)
                </label>
                <textarea
                  id='add-notes'
                  name='notes'
                  placeholder='e.g. Buy near EMA support'
                  className='h-24 w-full resize-none rounded-lg border border-border bg-secondary px-4 py-3 outline-none transition focus:border-primary/50'
                />
              </div>
              <div className='mt-4 flex gap-3'>
                <button
                  type='button'
                  onClick={() => {
                    setShowAddModal(false)
                    setNewTickerSymbol('')
                  }}
                  className='h-12 flex-1 rounded-lg bg-secondary font-bold text-muted-foreground transition hover:bg-secondary/80'
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  className='h-12 flex-1 rounded-lg bg-primary font-bold text-primary-foreground transition hover:bg-primary/90'
                >
                  Add Symbol
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Alerts Modal */}
      {showAlertModal && selectedItem && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm'>
          <div className='w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-2xl'>
            <div className='mb-6 flex items-center justify-between'>
              <h2 className='flex items-center gap-2 text-xl font-bold'>
                <FiBell className='text-primary' />
                Alerts for {selectedItem.symbol}
              </h2>
              <button
                onClick={() => setShowAlertModal(false)}
                className='rounded-lg p-2 text-muted-foreground hover:bg-secondary'
              >
                ✕
              </button>
            </div>

            <div className='custom-scrollbar mb-6 max-h-[400px] space-y-4 overflow-y-auto pr-2'>
              {loadingAlerts ? (
                <div className='space-y-3'>
                  <Skeleton className='h-16 w-full' />
                  <Skeleton className='h-16 w-full' />
                </div>
              ) : currentAlerts.length === 0 ? (
                <div className='rounded-lg border border-dashed border-border bg-secondary/30 py-10 text-center text-muted-foreground'>
                  <FiAlertCircle className='mx-auto mb-2 text-3xl opacity-20' />
                  No active alerts
                </div>
              ) : (
                currentAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className='flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-4 transition hover:border-primary/30'
                  >
                    <div className='flex items-center gap-4'>
                      <div
                        className={`rounded-lg p-2 ${alert.type === 'PRICE_ABOVE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-orange-500/10 text-orange-500'}`}
                      >
                        {alert.type === 'PRICE_ABOVE' ? (
                          <FiTrendingUp />
                        ) : (
                          <FiTrendingDown />
                        )}
                      </div>
                      <div>
                        <span className='mb-1 block text-[10px] uppercase leading-none tracking-widest text-muted-foreground'>
                          {alert.type.split('_').join(' ')}
                        </span>
                        <p className='font-mono text-lg font-bold leading-none'>
                          {formatNumber(alert.threshold, '$')}
                        </p>
                      </div>
                    </div>
                    <div className='flex items-center gap-4'>
                      <button
                        onClick={async () => {
                          if (!selectedItem) return
                          const nextState = !alert.isActive
                          // Optimistic update
                          setCurrentAlerts((prev) =>
                            prev.map((a) =>
                              a.id === alert.id
                                ? { ...a, isActive: nextState }
                                : a,
                            ),
                          )
                          try {
                            await api.patch(
                              `/api/v1/watchlist/${selectedItem.symbol}/alerts/${alert.id}`,
                              { isActive: nextState },
                            )
                            preloader.invalidate(
                              `/api/v1/watchlist/${selectedItem.symbol}/alerts`,
                            )
                            fetchWatchlist()
                          } catch (err) {
                            // Rollback
                            setCurrentAlerts((prev) =>
                              prev.map((a) =>
                                a.id === alert.id
                                  ? { ...a, isActive: !nextState }
                                  : a,
                              ),
                            )
                            toast.error('Update failed')
                          }
                        }}
                        className={`relative h-5 w-10 rounded-full transition-colors ${alert.isActive ? 'bg-cyan-500' : 'bg-gray-700'}`}
                      >
                        <div
                          className={`absolute top-1 h-3 w-3 rounded-full bg-white transition-all ${alert.isActive ? 'left-6' : 'left-1'}`}
                        />
                      </button>
                      <button
                        onClick={async () => {
                          setAlertToDelete({
                            symbol: selectedItem.symbol,
                            id: alert.id,
                          })
                          setShowAlertDeleteModal(true)
                        }}
                        className='rounded-lg p-2 text-gray-500 transition hover:bg-red-500/10 hover:text-red-400'
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className='border-t border-white/10 pt-6'>
              <div className='mb-4 flex items-center gap-2 rounded-xl border border-blue-500/10 bg-blue-500/5 p-3 text-[11px] text-blue-400'>
                <FiInfo className='shrink-0' />
                <span>
                  Note: Alerts have a 1-hour cooldown after triggering to
                  prevent spam.
                </span>
              </div>

              <h3 className='mb-4 text-xs font-bold uppercase tracking-widest text-gray-500'>
                Create New Alert
              </h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  const formData = new FormData(e.currentTarget)
                  const data = {
                    symbol: selectedItem.symbol,
                    type: newAlertType,
                    threshold: formData.get('threshold')
                      ? parseFloat(formData.get('threshold') as string)
                      : null,
                  }
                  try {
                    await api.post(
                      `/api/v1/watchlist/${selectedItem.symbol}/alerts`,
                      data,
                    )
                    preloader.invalidate(
                      `/api/v1/watchlist/${selectedItem.symbol}/alerts`,
                    )
                    toast.success('Alert set')
                    openAlerts(selectedItem.symbol)
                    fetchWatchlist()
                  } catch (err) {
                    toast.error('Failed to set alert')
                  }
                }}
                className='space-y-3'
              >
                <div className='grid grid-cols-2 gap-3'>
                  <select
                    name='type'
                    value={newAlertType}
                    onChange={(e) =>
                      setNewAlertType(e.target.value as Alert['type'])
                    }
                    className={`h-12 cursor-pointer appearance-none rounded-xl border px-4 text-sm font-medium outline-none focus:border-cyan-500/50 ${theme === 'dark' ? 'border-white/10 bg-white/5 text-white' : 'border-gray-200 bg-gray-50 text-gray-900'}`}
                  >
                    <option
                      value='PRICE_ABOVE'
                      className={
                        theme === 'dark'
                          ? 'bg-zinc-900 text-white'
                          : 'bg-white text-black'
                      }
                    >
                      Price Above
                    </option>
                    <option
                      value='PRICE_BELOW'
                      className={
                        theme === 'dark'
                          ? 'bg-zinc-900 text-white'
                          : 'bg-white text-black'
                      }
                    >
                      Price Below
                    </option>
                    <option
                      value='PCT_CHANGE_UP'
                      className={
                        theme === 'dark'
                          ? 'bg-zinc-900 text-white'
                          : 'bg-white text-black'
                      }
                    >
                      % Change Up
                    </option>
                    <option
                      value='PCT_CHANGE_DOWN'
                      className={
                        theme === 'dark'
                          ? 'bg-zinc-900 text-white'
                          : 'bg-white text-black'
                      }
                    >
                      % Change Down
                    </option>
                    <option
                      value='ENTRY_ZONE'
                      className={
                        theme === 'dark'
                          ? 'bg-zinc-900 text-white'
                          : 'bg-white text-black'
                      }
                    >
                      Entry Zone Hit
                    </option>
                    <option
                      value='STOP_LOSS_BREACHED'
                      className={
                        theme === 'dark'
                          ? 'bg-zinc-900 text-white'
                          : 'bg-white text-black'
                      }
                    >
                      Stop Loss Hit
                    </option>
                  </select>

                  {[
                    'PRICE_ABOVE',
                    'PRICE_BELOW',
                    'PCT_CHANGE_UP',
                    'PCT_CHANGE_DOWN',
                  ].includes(newAlertType) ? (
                    <input
                      name='threshold'
                      type='number'
                      step='0.01'
                      required
                      placeholder={
                        newAlertType.includes('PCT')
                          ? 'e.g. 5 (%)'
                          : 'Target Price'
                      }
                      className='h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-sm outline-none focus:border-cyan-500/50'
                    />
                  ) : (
                    <div className='flex h-12 items-center rounded-xl border border-white/5 bg-white/5 px-4 text-xs italic text-gray-500'>
                      No threshold needed
                    </div>
                  )}
                </div>

                <button
                  type='submit'
                  className='flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 font-bold text-black shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400'
                >
                  <FiPlus /> Set Alert
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Confirmation Modal for Conversion */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        onConfirm={executeConversion}
        onCancel={() => setShowConfirmModal(false)}
        title='Convert to Portfolio?'
        message={`Are you sure you want to convert ${confirmTarget} to a live portfolio position? This action is NOT reversible and will move the ticker from your watchlist to your active holdings.`}
        confirmText='Yes, Convert Now'
        cancelText='Maybe Later'
        variant='success'
      />

      <ConfirmationModal
        isOpen={showRemoveModal}
        onConfirm={executeRemove}
        onCancel={() => setShowRemoveModal(false)}
        title='Remove from Watchlist?'
        message={`Are you sure you want to remove ${symbolToRemove} from your watchlist? You will no longer receive price alerts or AI updates for this ticker.`}
        confirmText='Remove Now'
        cancelText='Cancel'
        variant='danger'
      />

      <ConfirmationModal
        isOpen={showAlertDeleteModal}
        onConfirm={async () => {
          if (!alertToDelete) return
          const target = alertToDelete
          const previousAlerts = [...currentAlerts]

          // Optimistic removal from modal list
          setCurrentAlerts((prev) => prev.filter((a) => a.id !== target.id))
          setShowAlertDeleteModal(false)
          setAlertToDelete(null)

          try {
            await api.delete(
              `/api/v1/watchlist/${target.symbol}/alerts/${target.id}`,
            )
            preloader.invalidate(`/api/v1/watchlist/${target.symbol}/alerts`)
            fetchWatchlist()
            toast.success('Alert deleted')
          } catch (err) {
            setCurrentAlerts(previousAlerts)
            toast.error('Delete failed')
          }
        }}
        onCancel={() => setShowAlertDeleteModal(false)}
        title='Delete Alert?'
        message='Are you sure you want to delete this price alert? This action cannot be undone.'
        confirmText='Delete'
        cancelText='Cancel'
        variant='danger'
      />
    </div>
  )
}

export default Watchlist
