// src/components/UnifiedNotifications.tsx
import React, { useState, useEffect, useRef } from 'react'
import {
  FiBell,
  FiChevronRight,
  FiCheckCircle,
  FiInfo,
  FiCheck,
} from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { formatTimeAgo, newsService } from '@/modules/news'
import { notificationService } from '../services'
import type { NewsSummary, NewsSummaryItem } from '@/modules/news'
import { useTheme } from '@/shared/hooks/useTheme'
import {
  AnnouncementAnchor,
  WhatsNewList,
  anchorProps,
  useAnnouncements,
} from '@/modules/announcements'
import { useAuth } from '@/modules/auth'
import { useSocket } from '@/shared/hooks/useSocket'
import { socketManager } from '@/shared/utils/socketManager'
import { SocketEvent } from '@/shared/utils/socket-events'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { useEscapeToClose } from '@/shared/hooks/useEscapeToClose'

export const UnifiedNotifications: React.FC = () => {
  const { theme } = useTheme()
  const { user } = useAuth()
  const { connected } = useSocket()
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const {
    enabled: announcementsEnabled,
    boot,
    markAllSeen,
  } = useAnnouncements()
  const whatsNewUnread = boot?.changelog.unreadCount ?? 0
  const [activeTab, setActiveTab] = useState<'news' | 'alerts' | 'whatsnew'>(
    'news',
  )
  const [newsSummary, setNewsSummary] = useState<NewsSummary | null>(null)
  const [notifSummary, setNotifSummary] = useState<any>(null)
  const [notifications, setNotifications] = useState<any[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [news, notifs] = await Promise.all([
        newsService.getSummary(),
        notificationService.getSummary(),
      ])
      setNewsSummary(news)
      setNotifSummary(notifs)

      if (activeTab === 'alerts') {
        const result = await notificationService.getNotifications()
        setNotifications(result.data)
        setNextCursor(result.nextCursor)
        setHasMore(result.hasMore)
      }
    } catch (err) {
      console.error('Failed to fetch summaries', err)
    } finally {
      setLoading(false)
    }
  }

  const loadMoreNotifications = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await notificationService.getNotifications(nextCursor)
      setNotifications((prev) => [...prev, ...result.data])
      setNextCursor(result.nextCursor)
      setHasMore(result.hasMore)
    } catch (err) {
      console.error('Load more notifications failed', err)
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [activeTab])

  useEffect(() => {
    if (connected && user?.id) {
      socketManager.emit(SocketEvent.Join, user.id)

      const onNotification = (newNotif: any) => {
        console.log('Real-time notification received:', newNotif)
        // Prepend to current list
        setNotifications((prev) => [newNotif, ...prev])
        // Refresh summary for badge
        notificationService.getSummary().then(setNotifSummary)
      }

      socketManager.on(SocketEvent.Notification, onNotification)
      return () => {
        socketManager.off(SocketEvent.Notification, onNotification)
      }
    }
  }, [connected, user?.id])

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

  useEscapeToClose(isOpen, () => setIsOpen(false), triggerRef)

  const NewsItem = ({ item }: { item: NewsSummaryItem }) => {
    const setRef = (el: HTMLButtonElement | null) => {
      if (el && !item.isRead) {
        itemRefs.current.set(item.id, el)
        observer.current?.observe(el)
      } else {
        itemRefs.current.delete(item.id)
      }
    }

    return (
      <button
        type='button'
        role='menuitem'
        ref={setRef}
        data-id={item.id}
        data-type='news'
        onClick={() => {
          newsService.markRead(item.id).catch(() => {})
          window.open(`/news?id=${item.id}`, '_blank')
          setIsOpen(false)
        }}
        className={`group relative flex w-full cursor-pointer gap-4 overflow-hidden p-4 text-left transition-all hover:bg-black/[0.02] focus:outline-none focus-visible:bg-black/[0.04] dark:hover:bg-white/[0.04] dark:focus-visible:bg-white/[0.06] ${!item.isRead ? 'bg-cyan-500/[0.02] dark:bg-cyan-500/[0.02]' : ''}`}
      >
        {!item.isRead && (
          <div className='absolute bottom-0 left-0 top-0 w-1 bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]' />
        )}

        <div className='pointer-events-none absolute bottom-0 right-0 top-0 w-40 opacity-0 transition-opacity group-hover:opacity-10'>
          <svg viewBox='0 0 100 40' className='h-full w-full'>
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
            <span className='shrink-0 rounded-lg border border-black/10 bg-black/5 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-tighter text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-white'>
              {item.symbol}
            </span>
            <span
              className={`rounded-lg px-1.5 py-0.5 text-[10px] font-black uppercase tracking-tight ${
                item.sentiment === 'BULLISH'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : item.sentiment === 'BEARISH'
                    ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                    : 'bg-gray-500/10 text-gray-500 dark:text-gray-400'
              }`}
            >
              {item.sentiment}
            </span>
            <span className='ml-auto shrink-0 text-[10px] font-bold uppercase tracking-tighter text-gray-400 dark:text-gray-600'>
              {formatTimeAgo(item.publishedAt)}
            </span>
          </div>
          <p
            className={`whitespace-normal break-words text-sm font-medium leading-snug tracking-tight ${!item.isRead ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
          >
            {item.headline}
          </p>
        </div>
      </button>
    )
  }

  const [pendingReadIds, setPendingReadIds] = useState<Set<string>>(new Set())
  const [pendingNewsIds, setPendingNewsIds] = useState<Set<string>>(new Set())
  const observer = useRef<IntersectionObserver | null>(null)
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map())

  useEffect(() => {
    if (pendingReadIds.size > 0) {
      const timer = setTimeout(async () => {
        const idsArray = Array.from(pendingReadIds)
        try {
          await notificationService.markMultipleRead(idsArray)
          setPendingReadIds(new Set())
          // Update local state to show as read
          setNotifications((prev) =>
            prev.map((n) =>
              idsArray.includes(n.id) ? { ...n, read: true } : n,
            ),
          )
          // Also refresh summary to update badge
          const summary = await notificationService.getSummary()
          setNotifSummary(summary)
        } catch (err) {
          console.error('Batch mark read failed', err)
        }
      }, 2000) // 2 second debounce for batching
      return () => clearTimeout(timer)
    }
  }, [pendingReadIds])

  useEffect(() => {
    if (pendingNewsIds.size > 0) {
      const timer = setTimeout(async () => {
        const idsArray = Array.from(pendingNewsIds)
        try {
          await newsService.markMultipleRead(idsArray)
          setPendingNewsIds(new Set())

          // Update summary for numbers
          const news = await newsService.getSummary()
          setNewsSummary(news)
        } catch (err) {
          console.error('Batch news mark read failed', err)
        }
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [pendingNewsIds])

  useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-id')
            const type = entry.target.getAttribute('data-type')
            if (id) {
              if (type === 'news') {
                setPendingNewsIds((prev) => new Set(prev).add(id))
                // Optimistic update
                setNewsSummary((prev) => {
                  if (!prev) return prev
                  return {
                    ...prev,
                    portfolioNews: prev.portfolioNews.map((n) =>
                      n.id === id ? { ...n, isRead: true } : n,
                    ),
                    watchlistNews: prev.watchlistNews.map((n) =>
                      n.id === id ? { ...n, isRead: true } : n,
                    ),
                    marketHeadlines: prev.marketHeadlines.map((n) =>
                      n.id === id ? { ...n, isRead: true } : n,
                    ),
                    unreadCount: Math.max(0, prev.unreadCount - 1),
                  }
                })
              } else {
                setPendingReadIds((prev) => new Set(prev).add(id))
                // Optimistic update
                setNotifications((prev: any[]) =>
                  prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
                )
                setNotifSummary((prev: any) =>
                  prev
                    ? {
                        ...prev,
                        unreadCount: Math.max(0, prev.unreadCount - 1),
                      }
                    : prev,
                )
              }
              observer.current?.unobserve(entry.target)
            }
          }
        })
      },
      { threshold: 0.5 },
    )

    return () => {
      if (observer.current) observer.current.disconnect()
    }
  }, [])

  const NotificationItem = ({ notif }: { notif: any }) => {
    const setRef = (el: HTMLButtonElement | null) => {
      if (el && !notif.read) {
        itemRefs.current.set(notif.id, el)
        observer.current?.observe(el)
      } else {
        itemRefs.current.delete(notif.id)
      }
    }

    return (
      <button
        type='button'
        role='menuitem'
        ref={setRef}
        data-id={notif.id}
        data-type='alert'
        onClick={async () => {
          if (!notif.read) await notificationService.markRead(notif.id)
          setIsOpen(false)
        }}
        className={`relative flex w-full cursor-pointer gap-4 border-b border-gray-100 p-5 text-left transition-all hover:bg-black/[0.02] focus:outline-none focus-visible:bg-black/[0.04] dark:border-white/[0.03] dark:hover:bg-white/[0.04] dark:focus-visible:bg-white/[0.06] ${!notif.read ? 'bg-cyan-500/[0.02]' : ''}`}
      >
        <div
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notif.read ? 'bg-transparent' : 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]'}`}
        />
        <div className='min-w-0 flex-1'>
          <div className='mb-1 flex items-start justify-between gap-4'>
            <h4
              className={`text-sm font-black uppercase leading-snug tracking-tight ${!notif.read ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
            >
              {notif.title}
            </h4>
            <span className='shrink-0 text-[10px] font-bold uppercase tracking-tighter text-gray-400 dark:text-gray-600'>
              {formatTimeAgo(notif.createdAt)}
            </span>
          </div>
          <p
            className={`text-xs leading-relaxed ${!notif.read ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}
          >
            {notif.body}
          </p>
        </div>
      </button>
    )
  }

  const totalUnread =
    (newsSummary?.unreadCount || 0) +
    (notifSummary?.unreadCount || 0) +
    whatsNewUnread

  return (
    <div className='relative' ref={dropdownRef}>
      <button
        ref={triggerRef}
        {...anchorProps(AnnouncementAnchor.NOTIFICATION_BELL)}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => {
          notificationService.getSummary().catch(() => {})
          newsService.getSummary().catch(() => {})
          notificationService.getNotifications().catch(() => {})
        }}
        onFocus={() => {
          notificationService.getSummary().catch(() => {})
          newsService.getSummary().catch(() => {})
        }}
        aria-haspopup='menu'
        aria-expanded={isOpen}
        className={`group relative rounded-xl border border-transparent p-2.5 transition-all ${
          isOpen
            ? 'border-cyan-500/20 bg-cyan-500/5 text-cyan-500 shadow-sm'
            : 'text-gray-400 hover:border-black/5 hover:bg-cyan-500/5 hover:text-cyan-400 dark:hover:border-white/5'
        }`}
        title='Alerts & Notifications'
      >
        <FiBell className='text-xl transition-transform group-active:scale-95' />
        {totalUnread > 0 && (
          <span className='absolute -right-1 -top-1 flex h-[20px] min-w-[20px] animate-[bounce_3s_infinite] items-center justify-center rounded-full border-2 border-white bg-red-500 text-[10px] font-black text-white dark:border-[#0A0D14]'>
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role='menu'
          className={`absolute left-0 z-[200] mt-4 w-[calc(100vw-2rem)] overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_40px_80px_rgba(0,0,0,0.15)] duration-300 animate-in fade-in slide-in-from-top-2 dark:border-white/10 dark:bg-[#0A0D14] dark:shadow-[0_30px_60px_rgba(0,0,0,0.8)] sm:w-[500px]`}
        >
          {/* Tabs Switcher */}
          <div className='flex border-b border-gray-100 bg-gray-50 p-1.5 dark:border-white/5 dark:bg-white/[0.01]'>
            <button
              onClick={() => setActiveTab('news')}
              className={`flex flex-1 items-center justify-center gap-3 rounded-2xl py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === 'news'
                  ? 'border border-gray-200 bg-white text-cyan-600 shadow-md dark:border-white/5 dark:bg-[#1a1c24] dark:text-cyan-400 dark:shadow-none'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              Market News
              {newsSummary && newsSummary.unreadCount > 0 && (
                <span className='rounded-full bg-cyan-500 px-2 py-0.5 text-[9px] font-black text-white'>
                  {newsSummary.unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`flex flex-1 items-center justify-center gap-3 rounded-2xl py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === 'alerts'
                  ? 'border border-gray-200 bg-white text-cyan-600 shadow-md dark:border-white/5 dark:bg-[#1a1c24] dark:text-cyan-400 dark:shadow-none'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              Alerts
              {notifSummary && notifSummary.unreadCount > 0 && (
                <span className='rounded-full bg-cyan-500 px-2 py-0.5 text-[9px] font-black text-white'>
                  {notifSummary.unreadCount}
                </span>
              )}
            </button>
            {announcementsEnabled && (
              <button
                onClick={() => setActiveTab('whatsnew')}
                className={`flex flex-1 items-center justify-center gap-3 rounded-2xl py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === 'whatsnew'
                    ? 'border border-gray-200 bg-white text-cyan-600 shadow-md dark:border-white/5 dark:bg-[#1a1c24] dark:text-cyan-400 dark:shadow-none'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                What&apos;s New
                {whatsNewUnread > 0 && (
                  <span className='rounded-full bg-cyan-500 px-2 py-0.5 text-[9px] font-black text-white'>
                    {whatsNewUnread}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Header Row */}
          <div className='flex items-center justify-between border-b border-gray-100 bg-white/50 px-6 py-5 dark:border-white/5 dark:bg-white/[0.01]'>
            <div>
              <h3 className='text-lg font-black uppercase tracking-widest text-gray-900 dark:text-white'>
                {activeTab === 'news' && 'Market Insights'}
                {activeTab === 'alerts' && 'Action Center'}
                {activeTab === 'whatsnew' && "What's New"}
              </h3>
            </div>
            {activeTab === 'whatsnew' ? (
              <button
                onClick={() => void markAllSeen()}
                className='flex items-center gap-2 rounded-xl border-2 border-cyan-500/30 px-5 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-600 transition-all hover:bg-cyan-500/10 dark:text-cyan-400'
              >
                <FiCheck size={14} /> MARK ALL READ
              </button>
            ) : activeTab === 'news' ? (
              <div className='flex items-center gap-2'>
                <button
                  onClick={async () => {
                    await newsService.markAllRead()
                    fetchData()
                  }}
                  className='flex items-center gap-2 rounded-xl border-2 border-cyan-500/30 px-5 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-600 transition-all hover:bg-cyan-500/10 dark:text-cyan-400'
                >
                  <FiCheck size={14} /> MARK ALL READ
                </button>
                <Link
                  to='/news'
                  onClick={() => setIsOpen(false)}
                  className='rounded-xl border-2 border-cyan-500/30 px-5 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-600 transition-all hover:bg-cyan-500/10 dark:text-cyan-400'
                >
                  VIEW FEED
                </Link>
              </div>
            ) : (
              <button
                onClick={async () => {
                  await notificationService.markAllRead()
                  fetchData()
                }}
                className='flex items-center gap-2 rounded-xl border-2 border-cyan-500/30 px-5 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-600 transition-all hover:bg-cyan-500/10 dark:text-cyan-400'
              >
                <FiCheck size={14} /> MARK ALL READ
              </button>
            )}
          </div>

          {/* Content Scroll Area */}
          <div className='custom-scrollbar-unified max-h-[600px] overflow-y-auto'>
            {activeTab === 'whatsnew' ? (
              <WhatsNewList onOpen={() => setIsOpen(false)} />
            ) : loading && activeTab === 'news' && !newsSummary ? (
              <div className='p-20 text-center'>
                <Skeleton className='mx-auto mb-6 h-12 w-12 rounded-full' />
                <p className='animate-pulse text-[10px] font-extrabold uppercase tracking-[0.4em] text-gray-400 dark:text-gray-500'>
                  Synchronizing Intelligence...
                </p>
              </div>
            ) : activeTab === 'news' ? (
              <div className='divide-y divide-gray-100 dark:divide-white/[0.03]'>
                {newsSummary?.portfolioNews.length === 0 &&
                newsSummary?.watchlistNews.length === 0 &&
                newsSummary?.marketHeadlines.length === 0 ? (
                  <div className='p-24 text-center'>
                    <FiInfo className='mx-auto mb-6 text-6xl text-gray-300 opacity-40 shadow-xl dark:text-gray-800' />
                    <p className='text-sm font-black uppercase tracking-widest text-gray-400 dark:text-gray-500'>
                      No Recent Intel
                    </p>
                  </div>
                ) : (
                  (() => {
                    const filterRelevant = (items: NewsSummaryItem[]) => {
                      const now = Date.now()
                      const oneDay = 24 * 60 * 60 * 1000
                      return items
                        .filter(
                          (item) =>
                            now - new Date(item.publishedAt).getTime() < oneDay,
                        )
                        .sort((a, b) => {
                          if (
                            a.sentiment !== 'NEUTRAL' &&
                            b.sentiment === 'NEUTRAL'
                          )
                            return -1
                          if (
                            a.sentiment === 'NEUTRAL' &&
                            b.sentiment !== 'NEUTRAL'
                          )
                            return 1
                          return (
                            new Date(b.publishedAt).getTime() -
                            new Date(a.publishedAt).getTime()
                          )
                        })
                        .slice(0, 3)
                    }

                    const portfolioRelevant = filterRelevant(
                      newsSummary?.portfolioNews || [],
                    )
                    const watchlistRelevant = filterRelevant(
                      newsSummary?.watchlistNews || [],
                    )
                    const marketRelevant = filterRelevant(
                      newsSummary?.marketHeadlines || [],
                    )

                    return (
                      <>
                        {portfolioRelevant.map((item) => (
                          <NewsItem key={item.id + 'p'} item={item} />
                        ))}
                        {watchlistRelevant.map((item) => (
                          <NewsItem key={item.id + 'w'} item={item} />
                        ))}
                        {marketRelevant.map((item) => (
                          <NewsItem key={item.id + 'm'} item={item} />
                        ))}
                      </>
                    )
                  })()
                )}
              </div>
            ) : (
              <div className=''>
                {notifications.length === 0 ? (
                  <div className='p-24 text-center'>
                    <FiCheckCircle className='mx-auto mb-6 text-6xl text-gray-200 opacity-40 dark:text-gray-800' />
                    <p className='text-sm font-black uppercase tracking-widest text-gray-400 dark:text-gray-500'>
                      Workspace Optimized
                    </p>
                  </div>
                ) : (
                  <>
                    {notifications.map((notif) => (
                      <NotificationItem key={notif.id} notif={notif} />
                    ))}
                    {hasMore && (
                      <div className='flex justify-center border-t border-gray-100 p-4 dark:border-white/5'>
                        <button
                          onClick={loadMoreNotifications}
                          disabled={loadingMore}
                          className='rounded-xl border-2 border-cyan-500/30 px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-600 transition-all hover:bg-cyan-500/10 disabled:opacity-50 dark:text-cyan-400'
                        >
                          {loadingMore ? 'Loading...' : 'Load More'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className='flex items-center justify-between border-t border-gray-100 bg-gray-50 p-5 dark:border-white/5 dark:bg-black/50'>
            <div className='flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-gray-400 dark:text-gray-600'>
              <FiCheckCircle size={14} className='text-cyan-500' />
              Active Monitoring
            </div>
            <Link
              to={activeTab === 'news' ? '/news' : '/dashboard'}
              onClick={() => setIsOpen(false)}
              className='group flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.25em] text-gray-500 transition-colors hover:text-cyan-600 dark:hover:text-cyan-400'
            >
              View All{' '}
              <FiChevronRight className='transition-transform group-hover:translate-x-1' />
            </Link>
          </div>

          <style>{`
                        .custom-scrollbar-unified::-webkit-scrollbar { width: 4px; }
                        .custom-scrollbar-unified::-webkit-scrollbar-track { background: transparent; }
                        .custom-scrollbar-unified::-webkit-scrollbar-thumb { 
                            background: rgba(0, 0, 0, 0.08); 
                            border-radius: 20px; 
                        }
                        .dark .custom-scrollbar-unified::-webkit-scrollbar-thumb {
                            background: rgba(255, 255, 255, 0.05);
                        }
                    `}</style>
        </div>
      )}
    </div>
  )
}
