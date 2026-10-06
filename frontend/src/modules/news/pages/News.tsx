// src/pages/News.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FiSearch, FiCalendar, FiX } from 'react-icons/fi'
import { Sidebar } from '@/shared/components/Sidebar'
import { NewsArticleItem } from '@/modules/news/components/NewsArticleItem'
import { newsService } from '../services'
import { NewsArticle, NewsFeedParams, NewsCategory } from '../types'
import { toast } from 'react-toastify'
import { SmartSearch } from '@/shared/components/SmartSearch'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'

const TODAY = new Date().toISOString().split('T')[0]

const CATEGORIES: { label: string; value: NewsCategory }[] = [
  { label: 'General', value: 'GENERAL' },
  { label: 'Earnings', value: 'EARNINGS' },
  { label: 'Analyst', value: 'ANALYST' },
  { label: 'Filing', value: 'FILING' },
  { label: 'Merger', value: 'MERGER' },
  { label: 'Macro', value: 'MACRO' },
  { label: 'Sector', value: 'SECTOR' },
]

const TABS = [
  { label: 'All Feed', value: 'all' },
  { label: 'Portfolio', value: 'portfolio' },
  { label: 'Watchlist', value: 'watchlist' },
  { label: 'Saved', value: 'saved' },
] as const

type NewsTab = (typeof TABS)[number]['value']

const isNewsTab = (value: string | null): value is NewsTab =>
  TABS.some((tab) => tab.value === value)

export default function News() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filterParam = searchParams.get('filter')
  const activeTab: NewsTab = isNewsTab(filterParam) ? filterParam : 'all'

  const setActiveTab = (tab: NewsTab) => {
    const next = new URLSearchParams(searchParams)
    if (tab === 'all') {
      next.delete('filter')
    } else {
      next.set('filter', tab)
    }
    setSearchParams(next, { replace: true })
  }
  const [activeCategory, setActiveCategory] = useState<NewsCategory | 'ALL'>(
    'ALL',
  )
  const [activeSymbol, setActiveSymbol] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)

  const [dateRange, setDateRange] = useState({
    startDate: '2026-01-01',
    endDate: TODAY,
  })

  const fromDateRef = useRef<HTMLInputElement>(null)
  const toDateRef = useRef<HTMLInputElement>(null)

  const observer = useRef<IntersectionObserver | null>(null)
  const lastElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading) return
      if (observer.current) observer.current.disconnect()
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          fetchNextPage()
        }
      })
      if (node) observer.current.observe(node)
    },
    [loading, hasMore, nextCursor],
  )

  const fetchArticles = async (isInitial = false) => {
    setLoading(true)
    try {
      const fromDate = dateRange.startDate
        ? new Date(`${dateRange.startDate}T00:00:00.000Z`).toISOString()
        : undefined
      const toDate = dateRange.endDate
        ? new Date(`${dateRange.endDate}T23:59:59.999Z`).toISOString()
        : undefined

      const params: NewsFeedParams = {
        filter: activeTab,
        category: activeCategory === 'ALL' ? undefined : activeCategory,
        symbol: activeSymbol || undefined,
        limit: 20,
        cursor: isInitial ? undefined : nextCursor || undefined,
        from: fromDate,
        to: toDate,
      }

      let response
      if (searchQuery.length >= 2) {
        response = await newsService.search({
          ...params,
          q: searchQuery,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          from: fromDate,
          to: toDate,
        })
      } else {
        response = await newsService.getFeed(params)
      }

      if (isInitial) {
        setArticles(response.data)
      } else {
        setArticles((prev) => {
          const existingIds = new Set(prev.map((a) => a.id))
          const newArticles = response.data.filter(
            (a) => !existingIds.has(a.id),
          )
          return [...prev, ...newArticles]
        })
      }

      setNextCursor(response.nextCursor)
      setHasMore(response.hasMore)
    } catch (err) {
      toast.error('Failed to fetch news articles')
    } finally {
      setLoading(false)
    }
  }

  const fetchNextPage = () => {
    if (nextCursor && hasMore && !loading) {
      fetchArticles(false)
    }
  }

  useEffect(() => {
    fetchArticles(true)
  }, [activeTab, activeCategory, dateRange])

  useEffect(() => {
    const timer = setTimeout(() => {
      const isSearchValid = searchQuery === '' || searchQuery.length >= 2
      if (isSearchValid) {
        fetchArticles(true)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery, activeSymbol])

  const handleUpdateArticle = (updated: NewsArticle) => {
    setArticles((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
  }

  return (
    <div className='flex h-screen flex-col overflow-hidden bg-background text-foreground lg:flex-row'>
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator { display: none; }
        input[type="date"] { -webkit-appearance: none; appearance: none; }
        .date-field-btn:hover { border-color: var(--primary) !important; }
      `}</style>
      <Sidebar />
      <main
        id='main-content'
        className='h-screen flex-1 overflow-y-auto overflow-x-hidden scroll-smooth p-4 md:px-10 md:py-10'
      >
        <div className='mx-auto max-w-5xl space-y-8 duration-1000 animate-in fade-in slide-in-from-bottom-4'>
          <div className='flex flex-col justify-between gap-6 md:flex-row md:items-center'>
            <div>
              <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
                Market News
              </h1>
              <p className='mt-1 text-sm font-medium text-muted-foreground'>
                Live news from top financial sources
              </p>
            </div>

            <div className='flex w-full flex-col items-center gap-4 md:w-auto md:flex-row'>
              <div className='group relative flex w-full items-center rounded-lg border border-border bg-secondary transition-colors focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 md:w-80'>
                <div className='absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground'>
                  <FiSearch className='transition-colors group-focus-within:text-primary' />
                </div>
                <input
                  type='text'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder='Search headlines...'
                  className='w-full bg-transparent py-3 pl-11 pr-12 text-sm font-medium outline-none'
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className='absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-primary'
                  >
                    <FiX size={16} />
                  </button>
                )}
              </div>

              <SmartSearch
                onSubmit={(sym) => setActiveSymbol(sym)}
                initialValue={activeSymbol}
                placeholder='Filter by symbol...'
                className='w-full md:w-80'
              />
            </div>
          </div>

          <div className='flex flex-col justify-between gap-6 lg:flex-row lg:items-center'>
            <div className='scrollbar-hide -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0'>
              <div className='flex w-max rounded-lg border border-border bg-secondary/50 p-1 sm:w-fit'>
                {TABS.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={`rounded-md px-5 py-2 text-xs font-bold transition-all duration-200 ${
                      activeTab === tab.value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className='flex items-center gap-2'>
              <FiCalendar className='shrink-0 text-lg text-primary' />
              {/* From date */}
              <button
                type='button'
                onClick={() => fromDateRef.current?.showPicker?.()}
                className='date-field-btn group relative flex cursor-pointer flex-col gap-0.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 transition-all hover:bg-primary/10'
                title='Click to pick start date'
              >
                <span className='text-[9px] font-black uppercase tracking-widest text-primary'>
                  From
                </span>
                <span className='text-xs font-bold text-foreground'>
                  {dateRange.startDate}
                </span>
                <input
                  ref={fromDateRef}
                  type='date'
                  value={dateRange.startDate}
                  max={TODAY}
                  onChange={(e) =>
                    setDateRange((prev) => ({
                      ...prev,
                      startDate: e.target.value,
                    }))
                  }
                  className='absolute inset-0 h-full w-full cursor-pointer opacity-0'
                  tabIndex={-1}
                />
              </button>
              <span className='text-sm font-bold text-muted-foreground/50'>
                →
              </span>
              {/* To date */}
              <button
                type='button'
                onClick={() => toDateRef.current?.showPicker?.()}
                className='date-field-btn group relative flex cursor-pointer flex-col gap-0.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 transition-all hover:bg-primary/10'
                title='Click to pick end date'
              >
                <span className='text-[9px] font-black uppercase tracking-widest text-primary'>
                  To
                </span>
                <span className='text-xs font-bold text-foreground'>
                  {dateRange.endDate}
                </span>
                <input
                  ref={toDateRef}
                  type='date'
                  value={dateRange.endDate}
                  max={TODAY}
                  onChange={(e) =>
                    setDateRange((prev) => ({
                      ...prev,
                      endDate: e.target.value,
                    }))
                  }
                  className='absolute inset-0 h-full w-full cursor-pointer opacity-0'
                  tabIndex={-1}
                />
              </button>
            </div>
          </div>

          <div className='flex flex-wrap gap-2 border-b border-border pb-4'>
            <Button
              variant={activeCategory === 'ALL' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setActiveCategory('ALL')}
              className='rounded-full text-[10px] font-black uppercase tracking-widest'
            >
              All Categories
            </Button>
            {CATEGORIES.map((cat) => (
              <Button
                key={cat.value}
                variant={activeCategory === cat.value ? 'default' : 'outline'}
                size='sm'
                onClick={() => setActiveCategory(cat.value)}
                className='rounded-full text-[10px] font-black uppercase tracking-widest'
              >
                {cat.label}
              </Button>
            ))}
          </div>

          <div className='space-y-6'>
            {articles.length === 0 && loading ? (
              <div className='space-y-6'>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className='flex flex-col gap-6 overflow-hidden rounded-lg border border-border bg-card p-5 shadow-sm md:flex-row'
                  >
                    <Skeleton className='h-40 w-full shrink-0 rounded-xl md:w-56' />
                    <div className='flex-1 space-y-3'>
                      <div className='flex justify-between gap-4'>
                        <Skeleton className='h-6 w-3/4 rounded-md' />
                        <Skeleton className='h-8 w-8 shrink-0 rounded-md' />
                      </div>
                      <div className='flex items-center gap-3'>
                        <Skeleton className='h-4 w-16 rounded-md' />
                        <Skeleton className='h-3 w-20 rounded' />
                        <Skeleton className='h-3 w-28 rounded' />
                      </div>
                      <div className='space-y-2 pt-2'>
                        <Skeleton className='h-3.5 w-full rounded' />
                        <Skeleton className='h-3.5 w-5/6 rounded' />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : articles.length === 0 && !loading ? (
              <div className='rounded-3xl border border-dashed border-border bg-muted/20 py-20 text-center'>
                <p className='text-sm font-bold uppercase tracking-widest text-gray-500'>
                  No articles found matching your criteria
                </p>
                <Button
                  variant='link'
                  onClick={() => {
                    setActiveTab('all')
                    setActiveCategory('ALL')
                    setSearchQuery('')
                  }}
                  className='mt-4 text-xs font-black text-cyan-600 underline decoration-cyan-500/30 underline-offset-4 dark:text-cyan-400'
                >
                  Clear all filters
                </Button>
              </div>
            ) : (
              <div className='space-y-6'>
                {articles.map((article) => (
                  <NewsArticleItem
                    key={article.id}
                    article={article}
                    onUpdate={handleUpdateArticle}
                  />
                ))}
              </div>
            )}

            <div ref={lastElementRef} className='py-6'>
              {loading && articles.length > 0 && (
                <div className='flex flex-col gap-6 overflow-hidden rounded-lg border border-border bg-card p-5 shadow-sm md:flex-row'>
                  <Skeleton className='h-40 w-full shrink-0 rounded-xl md:w-56' />
                  <div className='flex-1 space-y-3'>
                    <div className='flex justify-between gap-4'>
                      <Skeleton className='h-6 w-3/4 rounded-md' />
                      <Skeleton className='h-8 w-8 shrink-0 rounded-md' />
                    </div>
                    <div className='flex items-center gap-3'>
                      <Skeleton className='h-4 w-16 rounded-md' />
                      <Skeleton className='h-3 w-20 rounded' />
                    </div>
                    <div className='space-y-2 pt-2'>
                      <Skeleton className='h-3.5 w-full rounded' />
                      <Skeleton className='h-3.5 w-4/5 rounded' />
                    </div>
                  </div>
                </div>
              )}
              {!hasMore && articles.length > 0 && (
                <div className='flex items-center justify-center gap-4 py-6 text-muted-foreground'>
                  <div className='h-px w-20 bg-border' />
                  <p className='text-[10px] font-black uppercase tracking-[0.3em]'>
                    End of Feed
                  </p>
                  <div className='h-px w-20 bg-border' />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
