// src/pages/News.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { FiSearch, FiCalendar, FiX } from "react-icons/fi";
import { Sidebar } from "@/shared/components/Sidebar";
import { NewsArticleItem } from "@/modules/news/components/NewsArticleItem";
import { newsService } from "../services";
import { NewsArticle, NewsFeedParams, NewsCategory } from "../types";
import { toast } from "react-toastify";
import { useTheme } from "@/shared/hooks/useTheme";
import { SmartSearch } from "@/shared/components/SmartSearch";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";

const CATEGORIES: { label: string; value: NewsCategory }[] = [
  { label: 'General', value: 'GENERAL' }, 
  { label: 'Earnings', value: 'EARNINGS' },
  { label: 'Analyst', value: 'ANALYST' },
  { label: 'Filing', value: 'FILING' },
  { label: 'Merger', value: 'MERGER' },
  { label: 'Macro', value: 'MACRO' },
  { label: 'Sector', value: 'SECTOR' },
];

const TABS = [
  { label: 'All Feed', value: 'all' },
  { label: 'Portfolio', value: 'portfolio' },
  { label: 'Watchlist', value: 'watchlist' },
  { label: 'Saved', value: 'saved' },
] as const;

type NewsTab = (typeof TABS)[number]['value'];

const isNewsTab = (value: string | null): value is NewsTab =>
  TABS.some((tab) => tab.value === value);

export default function News() {
  const { theme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParam = searchParams.get('filter');
  const activeTab: NewsTab = isNewsTab(filterParam) ? filterParam : 'all';

  const setActiveTab = (tab: NewsTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'all') {
      next.delete('filter');
    } else {
      next.set('filter', tab);
    }
    setSearchParams(next, { replace: true });
  };
  const [activeCategory, setActiveCategory] = useState<NewsCategory | 'ALL'>('ALL');
  const [activeSymbol, setActiveSymbol] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  
  const [dateRange, setDateRange] = useState({
     startDate: '2026-01-01',
     endDate: '2026-12-31'
  });

  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        fetchNextPage();
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore, nextCursor]);

  const fetchArticles = async (isInitial = false) => {
    setLoading(true);
    try {
      const params: NewsFeedParams = {
        filter: activeTab,
        category: activeCategory === 'ALL' ? undefined : activeCategory,
        symbol: activeSymbol || undefined,
        limit: 20,
        cursor: isInitial ? undefined : nextCursor || undefined
      };

      let response;
      if (searchQuery.length >= 2) {
          response = await newsService.search({
              ...params,
              q: searchQuery,
              startDate: dateRange.startDate,
              endDate: dateRange.endDate
          });
      } else {
          response = await newsService.getFeed(params);
      }

      if (isInitial) {
        setArticles(response.data);
      } else {
        setArticles(prev => {
            const existingIds = new Set(prev.map(a => a.id));
            const newArticles = response.data.filter(a => !existingIds.has(a.id));
            return [...prev, ...newArticles];
        });
      }
      
      setNextCursor(response.nextCursor);
      setHasMore(response.hasMore);
    } catch (err) {
      toast.error("Failed to fetch news articles");
    } finally {
      setLoading(false);
    }
  };

  const fetchNextPage = () => {
    if (nextCursor && hasMore && !loading) {
      fetchArticles(false);
    }
  };

  useEffect(() => {
    fetchArticles(true);
  }, [activeTab, activeCategory, dateRange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const isSearchValid = searchQuery === "" || searchQuery.length >= 2;
      if (isSearchValid) {
        fetchArticles(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, activeSymbol]);

  const handleUpdateArticle = (updated: NewsArticle) => {
    setArticles(prev => prev.map(a => a.id === updated.id ? updated : a));
  };

  return (
    <div className={`h-screen flex ${theme === 'dark' ? 'bg-[#0a0a0a] text-gray-100' : 'bg-gray-50 text-gray-900'} font-inter overflow-hidden`}>
      <style>
        {`
          input[type="date"]::-webkit-calendar-picker-indicator {
            filter: invert(48%) sepia(79%) saturate(2476%) hue-rotate(159deg) brightness(118%) contrast(119%);
            cursor: pointer;
            opacity: 0.6;
            transition: all 0.3s ease;
          }
          input[type="date"]::-webkit-calendar-picker-indicator:hover {
            transform: scale(1.1);
            opacity: 1;
          }
        `}
      </style>
      <Sidebar />
      <main className="flex-1 p-4 md:px-10 md:py-10 overflow-y-auto overflow-x-hidden h-screen scroll-smooth">
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Market News
              </h1>
              <p className="text-sm text-muted-foreground mt-1 font-medium">Real-time intelligence from leading financial sources</p>
            </div>
            
             <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                <div className="relative group border border-border rounded-lg flex items-center bg-secondary w-full md:w-80">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <FiSearch className="group-focus-within:text-primary transition-colors" />
                  </div>
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search headlines..."
                    className="w-full bg-transparent pl-11 pr-12 py-3 text-sm font-medium outline-none"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <FiX size={16} />
                    </button>
                  )}
                </div>
               
               <SmartSearch 
                  onSubmit={(sym) => setActiveSymbol(sym)}
                  initialValue={activeSymbol}
                  placeholder="Filter by symbol..."
                  className="w-full md:w-80"
               />
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
              <div className="flex p-1 rounded-lg w-max sm:w-fit border border-border bg-secondary/50">
              {TABS.map(tab => (
                <button
                   key={tab.value}
                   onClick={() => setActiveTab(tab.value)}
                   className={`px-5 py-2 rounded-md text-xs font-bold transition-all duration-200 ${
                     activeTab === tab.value 
                       ? "bg-primary text-primary-foreground shadow-sm" 
                       : "text-muted-foreground hover:text-foreground"
                   }`}
                >
                  {tab.label}
                </button>
              ))}
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-secondary/30">
              <FiCalendar className="text-primary text-lg" />
              <div className="flex items-center gap-2">
                <input 
                   type="date"
                   value={dateRange.startDate}
                   onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                   className="bg-transparent border-none outline-none text-xs font-bold text-muted-foreground w-28 cursor-pointer"
                />
                <span className="text-muted-foreground/30 font-bold px-1">-</span>
                <input 
                   type="date"
                   value={dateRange.endDate}
                   onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                   className="bg-transparent border-none outline-none text-xs font-bold text-muted-foreground w-28 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pb-4 border-b border-border">
             <Button
               variant={activeCategory === 'ALL' ? "default" : "outline"}
               size="sm"
               onClick={() => setActiveCategory('ALL')}
               className="rounded-full text-[10px] font-black uppercase tracking-widest"
             >
               All Categories
             </Button>
             {CATEGORIES.map(cat => (
               <Button
                 key={cat.value}
                 variant={activeCategory === cat.value ? "default" : "outline"}
                 size="sm"
                 onClick={() => setActiveCategory(cat.value)}
                 className="rounded-full text-[10px] font-black uppercase tracking-widest"
               >
                 {cat.label}
               </Button>
             ))}
          </div>

          <div className="space-y-6">
            {articles.length === 0 && loading ? (
              <div className="space-y-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="border border-border rounded-lg overflow-hidden bg-card p-5 flex flex-col md:flex-row gap-6 shadow-sm">
                    <Skeleton className="w-full md:w-56 h-40 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="flex justify-between gap-4">
                        <Skeleton className="h-6 w-3/4 rounded-md" />
                        <Skeleton className="w-8 h-8 rounded-md shrink-0" />
                      </div>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-4 w-16 rounded-md" />
                        <Skeleton className="h-3 w-20 rounded" />
                        <Skeleton className="h-3 w-28 rounded" />
                      </div>
                      <div className="space-y-2 pt-2">
                        <Skeleton className="h-3.5 w-full rounded" />
                        <Skeleton className="h-3.5 w-5/6 rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : articles.length === 0 && !loading ? (
              <div className={`py-20 text-center rounded-3xl border border-dashed ${
                theme === 'dark' ? 'bg-white/[0.02] border-white/5' : 'bg-gray-100 border-gray-300'
              }`}>
                <p className="text-gray-500 font-bold uppercase tracking-widest text-sm">No articles found matching your criteria</p>
                <Button 
                  variant="link"
                  onClick={() => { setActiveTab('all'); setActiveCategory('ALL'); setSearchQuery(""); }}
                  className="mt-4 text-cyan-600 dark:text-cyan-400 text-xs font-black underline underline-offset-4 decoration-cyan-500/30"
                >
                  Clear all filters
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {articles.map((article) => (
                  <NewsArticleItem 
                    key={article.id} 
                    article={article} 
                    onUpdate={handleUpdateArticle}
                  />
                ))}
              </div>
            )}

            <div ref={lastElementRef} className="py-6">
              {loading && articles.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden bg-card p-5 flex flex-col md:flex-row gap-6 shadow-sm">
                  <Skeleton className="w-full md:w-56 h-40 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div className="flex justify-between gap-4">
                      <Skeleton className="h-6 w-3/4 rounded-md" />
                      <Skeleton className="w-8 h-8 rounded-md shrink-0" />
                    </div>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-4 w-16 rounded-md" />
                      <Skeleton className="h-3 w-20 rounded" />
                    </div>
                    <div className="space-y-2 pt-2">
                      <Skeleton className="h-3.5 w-full rounded" />
                      <Skeleton className="h-3.5 w-4/5 rounded" />
                    </div>
                  </div>
                </div>
              )}
              {!hasMore && articles.length > 0 && (
                <div className="flex items-center justify-center gap-4 text-muted-foreground py-6">
                   <div className={`h-px w-20 ${theme === 'dark' ? 'bg-white/5' : 'bg-gray-200'}`} />
                   <p className="text-[10px] font-black uppercase tracking-[0.3em]">End of Feed</p>
                   <div className={`h-px w-20 ${theme === 'dark' ? 'bg-white/5' : 'bg-gray-200'}`} />
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
