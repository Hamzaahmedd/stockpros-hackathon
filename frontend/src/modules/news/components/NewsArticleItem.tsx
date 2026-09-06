// src/components/NewsArticleItem.tsx
import React from 'react';
import { FiBookmark, FiClock } from 'react-icons/fi';
import { NewsArticle } from '../types';
import { newsService } from '../services';
import { toast } from 'react-toastify';
import { formatTimeAgo } from '@/modules/news/utils/date';
import { useTheme } from '@/shared/hooks/useTheme';

interface Props {
  article: NewsArticle;
  onUpdate: (updated: NewsArticle) => void;
  onClick?: () => void;
}

export const NewsArticleItem: React.FC<Props> = ({ article, onUpdate, onClick }) => {
  const { theme } = useTheme();

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'BULLISH': return 'text-green-500 bg-green-500/10 border-green-500/20';
      case 'BEARISH': return 'text-red-500 bg-red-500/10 border-red-500/20';
      default: return 'text-muted-foreground bg-muted border-border';
    }
  };

  const handleToggleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const previousSaved = article.isSaved;
    const nextSaved = !previousSaved;

    // Optimistic UI update
    onUpdate({ ...article, isSaved: nextSaved });

    try {
      if (previousSaved) {
        await newsService.unsaveArticle(article.id);
        toast.info("Removed from saved articles");
      } else {
        await newsService.saveArticle(article.id);
        toast.success("Article saved");
      }
    } catch (err) {
      // Rollback on error
      onUpdate({ ...article, isSaved: previousSaved });
      toast.error("Failed to update saved state");
    }
  };

  const handleOpen = () => {
    if (!article.isRead) {
      newsService.markRead(article.id).catch(() => {});
      onUpdate({ ...article, isRead: true });
    }
    if (onClick) onClick();
    window.open(article.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div 
      onClick={handleOpen}
      className="group relative border border-border rounded-lg overflow-hidden transition-all duration-300 cursor-pointer bg-card hover:border-border/80 hover:shadow-md"
    >
      <div className="flex flex-col md:flex-row gap-6 p-5">
        {/* image */}
        <div className="w-full md:w-56 h-40 shrink-0 rounded-xl overflow-hidden relative">
          <img 
            src={article.imageUrl} 
            alt={article.headline} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          {/* Category Chip */}
          <div className={`absolute top-2 left-2 px-2 py-1 backdrop-blur-md rounded-lg text-[10px] font-bold border ${
            theme === 'dark' ? 'bg-black/60 text-white border-white/10' : 'bg-white/80 text-gray-900 border-gray-200'
          }`}>
            {article.category}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h3 className="text-lg font-bold leading-tight group-hover:text-primary transition-colors">
              {article.headline}
            </h3>
            <button 
              onClick={handleToggleSave}
              className={`p-2 rounded-md border transition-all ${
                article.isSaved 
                  ? "bg-primary/10 border-primary/50 text-primary" 
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <FiBookmark className={article.isSaved ? "fill-primary" : ""} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors ${getSentimentColor(article.sentiment)}`}>
              {article.sentiment}
            </span>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium ml-2">
              <FiClock className="opacity-70" />
              {formatTimeAgo(article.publishedAt)}
            </div>
            <div className="text-[11px] text-muted-foreground font-bold ml-2">
              {article.source}
            </div>
            {article.isRead && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-md ml-auto bg-muted text-muted-foreground/50">READ</span>
            )}
          </div>

          {/* User Context Badges */}
          <div className="flex gap-2 mb-4">
            {article.userContext.inPortfolio && (
              <span className="px-2 py-1 bg-blue-500/10 text-blue-500 text-[10px] font-bold rounded-md border border-blue-500/20">
                In Portfolio
              </span>
            )}
            {article.userContext.inWatchlist && (
              <span className="px-2 py-1 bg-amber-500/10 text-amber-500 text-[10px] font-bold rounded-md border border-amber-500/20">
                In Watchlist
              </span>
            )}
          </div>

          {/* Summary Bullets */}
          <ul className="space-y-2 mb-4">
            {article.summaryBullets.map((bullet, idx) => (
              <li key={idx} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary/40 mt-2" />
                {bullet}
              </li>
            ))}
          </ul>

          {/* Footer */}
          <div className="flex items-center gap-3 pt-4 border-t border-border overflow-hidden">
             {article.relatedSymbols.slice(0, 5).map(sym => (
                <div key={sym} className="px-2 py-1 border border-border rounded-md text-xs font-bold bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                 {sym}
               </div>
             ))}
             {article.relatedSymbols.length > 5 && (
               <span className="text-[10px] text-muted-foreground font-bold">+{article.relatedSymbols.length - 5} MORE</span>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};
