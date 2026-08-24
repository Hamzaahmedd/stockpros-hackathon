// src/components/UnifiedNotifications.tsx
import React, { useState, useEffect, useRef } from 'react';
import { FiBell, FiChevronRight, FiCheckCircle, FiInfo, FiCheck } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { formatTimeAgo, newsService } from '@/modules/news';
import { notificationService } from '../services';
import type { NewsSummary, NewsSummaryItem } from '@/modules/news';
import { useTheme } from '@/shared/hooks/useTheme';
import { useAuth } from '@/modules/auth';
import { useSocket } from '@/shared/hooks/useSocket';
import { socketManager } from '@/shared/utils/socketManager';
import { Skeleton } from '@/shared/components/ui/skeleton';

export const UnifiedNotifications: React.FC = () => {
    const { theme } = useTheme();
    const { user } = useAuth();
    const { connected } = useSocket();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'news' | 'alerts'>('news');
    const [newsSummary, setNewsSummary] = useState<NewsSummary | null>(null);
    const [notifSummary, setNotifSummary] = useState<any>(null);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [news, notifs] = await Promise.all([
                newsService.getSummary(),
                notificationService.getSummary()
            ]);
            setNewsSummary(news);
            setNotifSummary(notifs);
            
            if (activeTab === 'alerts') {
                const result = await notificationService.getNotifications();
                setNotifications(result.data);
                setNextCursor(result.nextCursor);
                setHasMore(result.hasMore);
            }
        } catch (err) {
            console.error("Failed to fetch summaries", err);
        } finally {
            setLoading(false);
        }
    };

    const loadMoreNotifications = async () => {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const result = await notificationService.getNotifications(nextCursor);
            setNotifications(prev => [...prev, ...result.data]);
            setNextCursor(result.nextCursor);
            setHasMore(result.hasMore);
        } catch (err) {
            console.error('Load more notifications failed', err);
        } finally {
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, [activeTab]);

    useEffect(() => {
        if (connected && user?.id) {
            socketManager.emit('join', user.id);
            
            const onNotification = (newNotif: any) => {
                console.log("Real-time notification received:", newNotif);
                // Prepend to current list
                setNotifications(prev => [newNotif, ...prev]);
                // Refresh summary for badge
                notificationService.getSummary().then(setNotifSummary);
            };

            socketManager.on('notification', onNotification);
            return () => {
                socketManager.off('notification', onNotification);
            };
        }
    }, [connected, user?.id]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const NewsItem = ({ item }: { item: NewsSummaryItem }) => {
        const setRef = (el: HTMLDivElement | null) => {
            if (el && !item.isRead) {
                itemRefs.current.set(item.id, el);
                observer.current?.observe(el);
            } else {
                itemRefs.current.delete(item.id);
            }
        };

        return (
            <div 
              ref={setRef}
              data-id={item.id}
              data-type="news"
              onClick={() => {
                  newsService.markRead(item.id).catch(() => {});
                  window.open(`/news?id=${item.id}`, '_blank');
                  setIsOpen(false);
              }}
              className={`group p-4 flex gap-4 cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-all relative overflow-hidden ${!item.isRead ? 'bg-cyan-500/[0.02] dark:bg-cyan-500/[0.02]' : ''}`}
            >
                {!item.isRead && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]" />}
                
                <div className="absolute right-0 bottom-0 top-0 w-40 opacity-0 group-hover:opacity-10 pointer-events-none transition-opacity">
                   <svg viewBox="0 0 100 40" className="w-full h-full">
                      <path d="M0 35 Q 25 35, 35 25 T 60 20 T 90 10 T 100 5" fill="none" stroke="#22c55e" strokeWidth="2" />
                   </svg>
                </div>

                <div className="flex-1 min-w-0 z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-1.5 py-0.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg text-[10px] font-black text-gray-700 dark:text-white shrink-0 uppercase tracking-tighter">
                            {item.symbol}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tight ${
                            item.sentiment === 'BULLISH' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' : 
                            item.sentiment === 'BEARISH' ? 'text-red-600 dark:text-red-400 bg-red-500/10' : 
                            'text-gray-500 dark:text-gray-400 bg-gray-500/10'
                        }`}>
                            {item.sentiment}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-600 font-bold ml-auto shrink-0 uppercase tracking-tighter">
                            {formatTimeAgo(item.publishedAt)}
                        </span>
                    </div>
                    <p className={`text-sm font-medium leading-snug whitespace-normal break-words tracking-tight ${!item.isRead ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                        {item.headline}
                    </p>
                </div>
            </div>
        );
    };

    const [pendingReadIds, setPendingReadIds] = useState<Set<string>>(new Set());
    const [pendingNewsIds, setPendingNewsIds] = useState<Set<string>>(new Set());
    const observer = useRef<IntersectionObserver | null>(null);
    const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    useEffect(() => {
        if (pendingReadIds.size > 0) {
            const timer = setTimeout(async () => {
                const idsArray = Array.from(pendingReadIds);
                try {
                    await notificationService.markMultipleRead(idsArray);
                    setPendingReadIds(new Set());
                    // Update local state to show as read
                    setNotifications(prev => prev.map(n => idsArray.includes(n.id) ? { ...n, read: true } : n));
                    // Also refresh summary to update badge
                    const summary = await notificationService.getSummary();
                    setNotifSummary(summary);
                } catch (err) {
                    console.error("Batch mark read failed", err);
                }
            }, 2000); // 2 second debounce for batching
            return () => clearTimeout(timer);
        }
    }, [pendingReadIds]);

    useEffect(() => {
        if (pendingNewsIds.size > 0) {
            const timer = setTimeout(async () => {
                const idsArray = Array.from(pendingNewsIds);
                try {
                    await newsService.markMultipleRead(idsArray);
                    setPendingNewsIds(new Set());
                    
                    // Update summary for numbers
                    const news = await newsService.getSummary();
                    setNewsSummary(news);
                } catch (err) {
                    console.error("Batch news mark read failed", err);
                }
            }, 2000); 
            return () => clearTimeout(timer);
        }
    }, [pendingNewsIds]);

    useEffect(() => {
        observer.current = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.getAttribute('data-id');
                    const type = entry.target.getAttribute('data-type');
                    if (id) {
                        if (type === 'news') {
                            setPendingNewsIds(prev => new Set(prev).add(id));
                            // Optimistic update
                            setNewsSummary(prev => {
                                if (!prev) return prev;
                                return {
                                    ...prev,
                                    portfolioNews: prev.portfolioNews.map(n => n.id === id ? { ...n, isRead: true } : n),
                                    watchlistNews: prev.watchlistNews.map(n => n.id === id ? { ...n, isRead: true } : n),
                                    marketHeadlines: prev.marketHeadlines.map(n => n.id === id ? { ...n, isRead: true } : n),
                                    unreadCount: Math.max(0, prev.unreadCount - 1)
                                }
                            });
                        } else {
                            setPendingReadIds(prev => new Set(prev).add(id));
                            // Optimistic update
                            setNotifications((prev: any[]) => prev.map(n => n.id === id ? { ...n, read: true } : n));
                            setNotifSummary((prev: any) => prev ? { ...prev, unreadCount: Math.max(0, prev.unreadCount - 1) } : prev);
                        }
                        observer.current?.unobserve(entry.target);
                    }
                }
            });
        }, { threshold: 0.5 });

        return () => {
            if (observer.current) observer.current.disconnect();
        };
    }, []);

    const NotificationItem = ({ notif }: { notif: any }) => {
        const setRef = (el: HTMLDivElement | null) => {
            if (el && !notif.read) {
                itemRefs.current.set(notif.id, el);
                observer.current?.observe(el);
            } else {
                itemRefs.current.delete(notif.id);
            }
        };

        return (
            <div 
              ref={setRef}
              data-id={notif.id}
              data-type="alert"
              onClick={async () => {
                if (!notif.read) await notificationService.markRead(notif.id);
                setIsOpen(false);
              }}
              className={`p-5 flex gap-4 cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-all relative border-b border-gray-100 dark:border-white/[0.03] ${!notif.read ? 'bg-cyan-500/[0.02]' : ''}`}
            >
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${notif.read ? 'bg-transparent' : 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 mb-1">
                    <h4 className={`text-sm font-black tracking-tight leading-snug uppercase ${!notif.read ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                       {notif.title}
                    </h4>
                    <span className="text-[10px] text-gray-400 dark:text-gray-600 font-bold shrink-0 uppercase tracking-tighter">
                      {formatTimeAgo(notif.createdAt)}
                    </span>
                </div>
                <p className={`text-xs leading-relaxed ${!notif.read ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
                  {notif.body}
                </p>
              </div>
            </div>
        );
    };

    const totalUnread = (newsSummary?.unreadCount || 0) + (notifSummary?.unreadCount || 0);

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                onMouseEnter={() => {
                    notificationService.getSummary().catch(() => {});
                    newsService.getSummary().catch(() => {});
                    notificationService.getNotifications().catch(() => {});
                }}
                onFocus={() => {
                    notificationService.getSummary().catch(() => {});
                    newsService.getSummary().catch(() => {});
                }}
                className={`relative p-2.5 rounded-xl transition-all group border border-transparent ${
                    isOpen 
                    ? "text-cyan-500 bg-cyan-500/5 border-cyan-500/20 shadow-sm" 
                    : "text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/5 hover:border-black/5 dark:hover:border-white/5"
                }`}
                title="Alerts & Notifications"
            >
                <FiBell className="text-xl group-active:scale-95 transition-transform" />
                {totalUnread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-[bounce_3s_infinite] border-2 border-white dark:border-[#0A0D14]">
                        {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className={`absolute left-0 mt-4 w-[500px] bg-white dark:bg-[#0A0D14] border border-gray-200 dark:border-white/10 rounded-3xl shadow-[0_40px_80px_rgba(0,0,0,0.15)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.8)] z-[200] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300`}>
                    
                    {/* Tabs Switcher */}
                    <div className="flex border-b border-gray-100 dark:border-white/5 p-1.5 bg-gray-50 dark:bg-white/[0.01]">
                        <button 
                            onClick={() => setActiveTab('news')}
                            className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all gap-3 flex items-center justify-center ${
                                activeTab === 'news' 
                                ? 'bg-white dark:bg-[#1a1c24] text-cyan-600 dark:text-cyan-400 shadow-md dark:shadow-none border border-gray-200 dark:border-white/5' 
                                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                        >
                            Market News
                            {newsSummary && newsSummary.unreadCount > 0 && (
                                <span className="px-2 py-0.5 bg-cyan-500 text-white text-[9px] rounded-full font-black">{newsSummary.unreadCount}</span>
                            )}
                        </button>
                        <button 
                            onClick={() => setActiveTab('alerts')}
                            className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all gap-3 flex items-center justify-center ${
                                activeTab === 'alerts' 
                                ? 'bg-white dark:bg-[#1a1c24] text-cyan-600 dark:text-cyan-400 shadow-md dark:shadow-none border border-gray-200 dark:border-white/5' 
                                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                        >
                            Alerts
                            {notifSummary && notifSummary.unreadCount > 0 && (
                                <span className="px-2 py-0.5 bg-cyan-500 text-white text-[9px] rounded-full font-black">{notifSummary.unreadCount}</span>
                            )}
                        </button>
                    </div>

                    {/* Header Row */}
                    <div className="px-6 py-5 border-b border-gray-100 dark:border-white/5 bg-white/50 dark:bg-white/[0.01] flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-black text-gray-900 dark:text-white tracking-widest uppercase">
                                {activeTab === 'news' ? 'Market Insights' : 'Action Center'}
                            </h3>
                        </div>
                        {activeTab === 'news' ? (
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={async () => {
                                        await newsService.markAllRead();
                                        fetchData();
                                    }}
                                    className="px-5 py-2 rounded-xl border-2 border-cyan-500/30 text-[10px] font-black text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 transition-all uppercase tracking-[0.2em] flex items-center gap-2"
                                >
                                    <FiCheck size={14} /> MARK ALL READ
                                </button>
                                <Link 
                                    to="/news" 
                                    onClick={() => setIsOpen(false)}
                                    className="px-5 py-2 rounded-xl border-2 border-cyan-500/30 text-[10px] font-black text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 transition-all uppercase tracking-[0.2em]"
                                >
                                    VIEW FEED
                                </Link>
                            </div>
                        ) : (
                            <button 
                                onClick={async () => {
                                    await notificationService.markAllRead();
                                    fetchData();
                                }}
                                className="px-5 py-2 rounded-xl border-2 border-cyan-500/30 text-[10px] font-black text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 transition-all uppercase tracking-[0.2em] flex items-center gap-2"
                            >
                                <FiCheck size={14} /> MARK ALL READ
                            </button>
                        )}
                    </div>

                    {/* Content Scroll Area */}
                    <div className="max-h-[600px] overflow-y-auto custom-scrollbar-unified">
                        {loading && activeTab === 'news' && !newsSummary ? (
                            <div className="p-20 text-center">
                                <Skeleton className="w-12 h-12 rounded-full mx-auto mb-6" />
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-extrabold uppercase tracking-[0.4em] animate-pulse">Synchronizing Intelligence...</p>
                            </div>
                        ) : activeTab === 'news' ? (
                            <div className="divide-y divide-gray-100 dark:divide-white/[0.03]">
                                {newsSummary?.portfolioNews.length === 0 && newsSummary?.watchlistNews.length === 0 && newsSummary?.marketHeadlines.length === 0 ? (
                                    <div className="p-24 text-center">
                                        <FiInfo className="text-6xl text-gray-300 dark:text-gray-800 mx-auto mb-6 opacity-40 shadow-xl" />
                                        <p className="text-sm text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest">No Recent Intel</p>
                                    </div>
                                ) : (
                                    (() => {
                                        const filterRelevant = (items: NewsSummaryItem[]) => {
                                            const now = Date.now();
                                            const oneDay = 24 * 60 * 60 * 1000;
                                            return items
                                                .filter(item => (now - new Date(item.publishedAt).getTime()) < oneDay)
                                                .sort((a, b) => {
                                                    if (a.sentiment !== 'NEUTRAL' && b.sentiment === 'NEUTRAL') return -1;
                                                    if (a.sentiment === 'NEUTRAL' && b.sentiment !== 'NEUTRAL') return 1;
                                                    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
                                                })
                                                .slice(0, 3);
                                        };

                                        const portfolioRelevant = filterRelevant(newsSummary?.portfolioNews || []);
                                        const watchlistRelevant = filterRelevant(newsSummary?.watchlistNews || []);
                                        const marketRelevant = filterRelevant(newsSummary?.marketHeadlines || []);

                                        return (
                                            <>
                                                {portfolioRelevant.map(item => <NewsItem key={item.id + 'p'} item={item} />)}
                                                {watchlistRelevant.map(item => <NewsItem key={item.id + 'w'} item={item} />)}
                                                {marketRelevant.map(item => <NewsItem key={item.id + 'm'} item={item} />)}
                                            </>
                                        );
                                    })()
                                )}
                            </div>
                        ) : (
                            <div className="">
                                {notifications.length === 0 ? (
                                    <div className="p-24 text-center">
                                        <FiCheckCircle className="text-6xl text-gray-200 dark:text-gray-800 mx-auto mb-6 opacity-40" />
                                        <p className="text-sm text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest">Workspace Optimized</p>
                                    </div>
                                ) : (
                                    <>
                                        {notifications.map(notif => <NotificationItem key={notif.id} notif={notif} />)}
                                        {hasMore && (
                                            <div className="p-4 flex justify-center border-t border-gray-100 dark:border-white/5">
                                                <button
                                                    onClick={loadMoreNotifications}
                                                    disabled={loadingMore}
                                                    className="px-6 py-2 rounded-xl border-2 border-cyan-500/30 text-[10px] font-black text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 transition-all uppercase tracking-[0.2em] disabled:opacity-50"
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
                    <div className="p-5 bg-gray-50 dark:bg-black/50 border-t border-gray-100 dark:border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-400 dark:text-gray-600 text-[10px] font-black uppercase tracking-[0.15em]">
                            <FiCheckCircle size={14} className="text-cyan-500" />
                            Active Monitoring
                        </div>
                        <Link 
                            to={activeTab === 'news' ? '/news' : '/dashboard'}
                            onClick={() => setIsOpen(false)}
                            className="text-[11px] font-black text-gray-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors uppercase tracking-[0.25em] flex items-center gap-1 group"
                        >
                            View All <FiChevronRight className="group-hover:translate-x-1 transition-transform" />
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
    );
};
