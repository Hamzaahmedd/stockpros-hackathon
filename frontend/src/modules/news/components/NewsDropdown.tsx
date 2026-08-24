// src/components/NewsDropdown.tsx
import React, { useState, useEffect, useRef } from 'react';
import { FiBell, FiChevronRight, FiCheckCircle, FiInfo, FiCheck } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { newsService } from '../services';
import { NewsSummary, NewsSummaryItem } from '../types';
import { formatTimeAgo } from '@/modules/news/utils/date';
import { Skeleton } from '@/shared/components/ui/skeleton';

interface Props {
    align?: 'left' | 'right';
}

export const NewsDropdown: React.FC<Props> = ({ align = 'left' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [summary, setSummary] = useState<NewsSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchSummary = async () => {
        setLoading(true);
        try {
            const data = await newsService.getSummary();
            setSummary(data);
        } catch (err) {
            console.error("Failed to fetch news summary", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
        const interval = setInterval(fetchSummary, 60000); // 60s polling
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const NewsItem = ({ item }: { item: NewsSummaryItem }) => (
        <div 
          onClick={() => {
              newsService.markRead(item.id).catch(() => {});
              window.open(`/news?id=${item.id}`, '_blank');
              setIsOpen(false);
          }}
          className={`group p-4 flex gap-4 cursor-pointer hover:bg-white/[0.04] transition-all relative overflow-hidden ${!item.isRead ? 'bg-cyan-500/[0.02]' : ''}`}
        >
            {!item.isRead && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]" />}
            
            {/* Background Chart Effect (SS2) */}
            <div className="absolute right-0 bottom-0 top-0 w-40 opacity-0 group-hover:opacity-10 pointer-events-none transition-opacity">
               <svg viewBox="0 0 100 40" className="w-full h-full preserve-3d">
                  <path d="M0 35 Q 25 35, 35 25 T 60 20 T 90 10 T 100 5" fill="none" stroke="#22c55e" strokeWidth="2" />
               </svg>
            </div>

            <div className="flex-1 min-w-0 z-10">
                <div className="flex items-center gap-2 mb-2">
                    <span className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-white shrink-0">
                        {item.symbol}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tight ${
                        item.sentiment === 'BULLISH' ? 'text-emerald-400 bg-emerald-500/10' : 
                        item.sentiment === 'BEARISH' ? 'text-red-400 bg-red-500/10' : 
                        'text-gray-400 bg-gray-500/10'
                    }`}>
                        {item.sentiment}
                    </span>
                    <span className="text-[10px] text-gray-500 font-bold ml-auto shrink-0 uppercase tracking-tighter">
                        {formatTimeAgo(item.publishedAt)}
                    </span>
                </div>
                <p className={`text-sm font-medium leading-snug whitespace-normal break-words tracking-tight ${!item.isRead ? 'text-white' : 'text-gray-400'}`}>
                    {item.headline}
                </p>
            </div>
        </div>
    );

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2.5 rounded-xl text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/5 transition-all group border border-transparent hover:border-white/5"
                title="News Alerts"
            >
                <FiBell className="text-xl group-active:scale-95 transition-transform" />
                {summary && summary.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-[bounce_2s_infinite] border-2 border-[#0A0D14]">
                        {summary.unreadCount > 99 ? '99+' : summary.unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-4 w-[500px] bg-[#0A0D14] border border-white/10 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.8)] z-[200] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300`}>
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-bold text-white tracking-tight">Market News</h3>
                            {summary && summary.unreadCount > 0 && (
                                <p className="text-[11px] text-gray-500 font-medium mt-0.5 tracking-tight">{summary.unreadCount} unread articles currently</p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={async () => {
                                    await newsService.markAllRead();
                                    fetchSummary();
                                }}
                                className="px-4 py-1.5 rounded-lg border border-cyan-500/40 text-[10px] font-black text-cyan-400 hover:bg-cyan-500/10 transition-all uppercase tracking-[0.1em] flex items-center gap-2"
                            >
                                <FiCheck size={12} /> MARK ALL READ
                            </button>
                            <Link 
                                to="/news" 
                                onClick={() => setIsOpen(false)}
                                className="px-4 py-1.5 rounded-lg border border-cyan-500/40 text-[10px] font-black text-cyan-400 hover:bg-cyan-500/10 transition-all uppercase tracking-[0.1em]"
                            >
                                VIEW FEED
                            </Link>
                        </div>
                    </div>

                    {/* Content Scroll Area */}
                    <div className="max-h-[580px] overflow-y-auto custom-scrollbar-news">
                        {loading && !summary ? (
                            <div className="divide-y divide-border/30 p-2">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="p-4 space-y-2.5">
                                        <div className="flex items-center gap-2">
                                            <Skeleton className="h-4 w-12 rounded" />
                                            <Skeleton className="h-4 w-16 rounded" />
                                            <Skeleton className="h-3 w-14 ml-auto rounded" />
                                        </div>
                                        <Skeleton className="h-4 w-full rounded" />
                                        <Skeleton className="h-4 w-4/5 rounded" />
                                    </div>
                                ))}
                            </div>
                        ) : !summary || (summary.portfolioNews.length === 0 && summary.watchlistNews.length === 0 && summary.marketHeadlines.length === 0) ? (
                            <div className="p-20 text-center">
                                <FiInfo className="text-5xl text-gray-800 mx-auto mb-4 opacity-50" />
                                <p className="text-sm text-gray-500 font-bold">No Recent Intelligence</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/[0.03]">
                                {summary.portfolioNews.length > 0 && (
                                    <>
                                        <div className="px-5 py-3 bg-white/[0.02] text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                                            Portfolio Insights
                                        </div>
                                        {summary.portfolioNews.map(item => <NewsItem key={item.id + 'p'} item={item} />)}
                                    </>
                                )}
                                {summary.watchlistNews.length > 0 && (
                                    <>
                                        <div className="px-5 py-3 bg-white/[0.02] text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                                            Watchlist Updates
                                        </div>
                                        {summary.watchlistNews.map(item => <NewsItem key={item.id + 'w'} item={item} />)}
                                    </>
                                )}
                                {summary.marketHeadlines.length > 0 && (
                                    <>
                                        <div className="px-5 py-3 bg-white/[0.02] text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-gray-500 shadow-[0_0_8px_rgba(107,114,128,0.5)]" />
                                            Market Headlines
                                        </div>
                                        {summary.marketHeadlines.map(item => <NewsItem key={item.id + 'm'} item={item} />)}
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 bg-black/40 border-t border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-600 text-[10px] font-bold uppercase tracking-wider">
                            <FiCheckCircle size={12} />
                            All Caught Up
                        </div>
                        <Link 
                            to="/news"
                            onClick={() => setIsOpen(false)}
                            className="text-[10px] font-black text-gray-500 hover:text-cyan-400 transition-colors uppercase tracking-widest flex items-center gap-1 group"
                        >
                            Open Dashboard <FiChevronRight className="group-hover:translate-x-1 transition-transform" />
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
    );
};
