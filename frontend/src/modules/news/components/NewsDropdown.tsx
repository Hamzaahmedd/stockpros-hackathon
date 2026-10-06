// src/components/NewsDropdown.tsx
import React, { useState, useEffect, useRef } from 'react'
import {
  FiBell,
  FiChevronRight,
  FiCheckCircle,
  FiInfo,
  FiCheck,
} from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { newsService } from '../services'
import { NewsSummary, NewsSummaryItem } from '../types'
import { formatTimeAgo } from '@/modules/news/utils/date'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { useEscapeToClose } from '@/shared/hooks/useEscapeToClose'

interface Props {
  align?: 'left' | 'right'
}

export const NewsDropdown: React.FC<Props> = ({ align = 'left' }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [summary, setSummary] = useState<NewsSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEscapeToClose(isOpen, () => setIsOpen(false), triggerRef)

  const fetchSummary = async () => {
    setLoading(true)
    try {
      const data = await newsService.getSummary()
      setSummary(data)
    } catch (err) {
      console.error('Failed to fetch news summary', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSummary()
    const interval = setInterval(fetchSummary, 60000) // 60s polling
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const NewsItem = ({ item }: { item: NewsSummaryItem }) => (
    <button
      type='button'
      role='menuitem'
      onClick={() => {
        newsService.markRead(item.id).catch(() => {})
        window.open(`/news?id=${item.id}`, '_blank')
        setIsOpen(false)
      }}
      className={`group relative flex w-full cursor-pointer gap-4 overflow-hidden p-4 text-left transition-all hover:bg-white/[0.04] focus:outline-none focus-visible:bg-white/[0.06] ${!item.isRead ? 'bg-cyan-500/[0.02]' : ''}`}
    >
      {!item.isRead && (
        <div className='absolute bottom-0 left-0 top-0 w-1 bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]' />
      )}

      {/* Background Chart Effect (SS2) */}
      <div className='pointer-events-none absolute bottom-0 right-0 top-0 w-40 opacity-0 transition-opacity group-hover:opacity-10'>
        <svg viewBox='0 0 100 40' className='preserve-3d h-full w-full'>
          <path
            d='M0 35 Q 25 35, 35 25 T 60 20 T 90 10 T 100 5'
            fill='none'
            stroke='#22c55e'
            strokeWidth='2'
          />
        </svg>
      </div>

      <div className='z-10 min-w-0 flex-1'>
        <div className='mb-2 flex items-center gap-2'>
          <span className='shrink-0 rounded-lg border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-black text-white'>
            {item.symbol}
          </span>
          <span
            className={`rounded-lg px-1.5 py-0.5 text-[10px] font-black uppercase tracking-tight ${
              item.sentiment === 'BULLISH'
                ? 'bg-emerald-500/10 text-emerald-400'
                : item.sentiment === 'BEARISH'
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-gray-500/10 text-gray-400'
            }`}
          >
            {item.sentiment}
          </span>
          <span className='ml-auto shrink-0 text-[10px] font-bold uppercase tracking-tighter text-gray-500'>
            {formatTimeAgo(item.publishedAt)}
          </span>
        </div>
        <p
          className={`whitespace-normal break-words text-sm font-medium leading-snug tracking-tight ${!item.isRead ? 'text-white' : 'text-gray-400'}`}
        >
          {item.headline}
        </p>
      </div>
    </button>
  )

  return (
    <div className='relative' ref={dropdownRef}>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup='menu'
        aria-expanded={isOpen}
        className='group relative rounded-xl border border-transparent p-2.5 text-gray-400 transition-all hover:border-white/5 hover:bg-cyan-500/5 hover:text-cyan-400'
        title='News Alerts'
      >
        <FiBell className='text-xl transition-transform group-active:scale-95' />
        {summary && summary.unreadCount > 0 && (
          <span className='absolute -right-1 -top-1 flex h-[18px] min-w-[18px] animate-[bounce_2s_infinite] items-center justify-center rounded-full border-2 border-[#0A0D14] bg-red-500 text-[10px] font-bold text-white'>
            {summary.unreadCount > 99 ? '99+' : summary.unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role='menu'
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-[200] mt-4 w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#0A0D14] shadow-[0_30px_60px_rgba(0,0,0,0.8)] duration-300 animate-in fade-in slide-in-from-top-2 sm:w-[500px]`}
        >
          {/* Header */}
          <div className='flex items-center justify-between border-b border-white/5 bg-white/[0.01] px-5 py-4'>
            <div>
              <h3 className='text-base font-bold tracking-tight text-white'>
                Market News
              </h3>
              {summary && summary.unreadCount > 0 && (
                <p className='mt-0.5 text-[11px] font-medium tracking-tight text-gray-500'>
                  {summary.unreadCount} unread articles currently
                </p>
              )}
            </div>
            <div className='flex items-center gap-2'>
              <button
                onClick={async () => {
                  await newsService.markAllRead()
                  fetchSummary()
                }}
                className='flex items-center gap-2 rounded-lg border border-cyan-500/40 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-400 transition-all hover:bg-cyan-500/10'
              >
                <FiCheck size={12} /> MARK ALL READ
              </button>
              <Link
                to='/news'
                onClick={() => setIsOpen(false)}
                className='rounded-lg border border-cyan-500/40 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-400 transition-all hover:bg-cyan-500/10'
              >
                VIEW FEED
              </Link>
            </div>
          </div>

          {/* Content Scroll Area */}
          <div className='custom-scrollbar-news max-h-[580px] overflow-y-auto'>
            {loading && !summary ? (
              <div className='divide-y divide-border/30 p-2'>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className='space-y-2.5 p-4'>
                    <div className='flex items-center gap-2'>
                      <Skeleton className='h-4 w-12 rounded' />
                      <Skeleton className='h-4 w-16 rounded' />
                      <Skeleton className='ml-auto h-3 w-14 rounded' />
                    </div>
                    <Skeleton className='h-4 w-full rounded' />
                    <Skeleton className='h-4 w-4/5 rounded' />
                  </div>
                ))}
              </div>
            ) : !summary ||
              (summary.portfolioNews.length === 0 &&
                summary.watchlistNews.length === 0 &&
                summary.marketHeadlines.length === 0) ? (
              <div className='p-20 text-center'>
                <FiInfo className='mx-auto mb-4 text-5xl text-gray-800 opacity-50' />
                <p className='text-sm font-bold text-gray-500'>
                  No Recent Intelligence
                </p>
              </div>
            ) : (
              <div className='divide-y divide-white/[0.03]'>
                {summary.portfolioNews.length > 0 && (
                  <>
                    <div className='flex items-center gap-2 bg-white/[0.02] px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-500'>
                      <div className='h-2 w-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]' />
                      Portfolio Insights
                    </div>
                    {summary.portfolioNews.map((item) => (
                      <NewsItem key={item.id + 'p'} item={item} />
                    ))}
                  </>
                )}
                {summary.watchlistNews.length > 0 && (
                  <>
                    <div className='flex items-center gap-2 bg-white/[0.02] px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-500'>
                      <div className='h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' />
                      Watchlist Updates
                    </div>
                    {summary.watchlistNews.map((item) => (
                      <NewsItem key={item.id + 'w'} item={item} />
                    ))}
                  </>
                )}
                {summary.marketHeadlines.length > 0 && (
                  <>
                    <div className='flex items-center gap-2 bg-white/[0.02] px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-500'>
                      <div className='h-2 w-2 rounded-full bg-gray-500 shadow-[0_0_8px_rgba(107,114,128,0.5)]' />
                      Market Headlines
                    </div>
                    {summary.marketHeadlines.map((item) => (
                      <NewsItem key={item.id + 'm'} item={item} />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className='flex items-center justify-between border-t border-white/5 bg-black/40 p-4'>
            <div className='flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-600'>
              <FiCheckCircle size={12} />
              All Caught Up
            </div>
            <Link
              to='/news'
              onClick={() => setIsOpen(false)}
              className='group flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-gray-500 transition-colors hover:text-cyan-400'
            >
              Open Dashboard{' '}
              <FiChevronRight className='transition-transform group-hover:translate-x-1' />
            </Link>
          </div>

          <style>{`
                        .custom-scrollbar-news::-webkit-scrollbar { width: 4px; }
                        .custom-scrollbar-news::-webkit-scrollbar-track { background: transparent; }
                        .custom-scrollbar-news::-webkit-scrollbar-thumb { 
                            background: rgba(255, 255, 255, 0.05); 
                            border-radius: 10px; 
                        }
                        .custom-scrollbar-news::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.1); }
                    `}</style>
        </div>
      )}
    </div>
  )
}
