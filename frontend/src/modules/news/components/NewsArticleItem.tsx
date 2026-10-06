// src/components/NewsArticleItem.tsx
import React from 'react'
import { FiBookmark, FiClock } from 'react-icons/fi'
import { NewsArticle } from '../types'
import { newsService } from '../services'
import { toast } from 'react-toastify'
import { formatTimeAgo } from '@/modules/news/utils/date'
import { useTheme } from '@/shared/hooks/useTheme'

interface Props {
  article: NewsArticle
  onUpdate: (updated: NewsArticle) => void
  onClick?: () => void
}

export const NewsArticleItem: React.FC<Props> = ({
  article,
  onUpdate,
  onClick,
}) => {
  const { theme } = useTheme()

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'BULLISH':
        return 'text-green-500 bg-green-500/10 border-green-500/20'
      case 'BEARISH':
        return 'text-red-500 bg-red-500/10 border-red-500/20'
      default:
        return 'text-muted-foreground bg-muted border-border'
    }
  }

  const handleToggleSave = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const previousSaved = article.isSaved
    const nextSaved = !previousSaved

    // Optimistic UI update
    onUpdate({ ...article, isSaved: nextSaved })

    try {
      if (previousSaved) {
        await newsService.unsaveArticle(article.id)
        toast.info('Removed from saved articles')
      } else {
        await newsService.saveArticle(article.id)
        toast.success('Article saved')
      }
    } catch (err) {
      // Rollback on error
      onUpdate({ ...article, isSaved: previousSaved })
      toast.error('Failed to update saved state')
    }
  }

  const handleOpen = () => {
    if (!article.isRead) {
      newsService.markRead(article.id).catch(() => {})
      onUpdate({ ...article, isRead: true })
    }
    if (onClick) onClick()
    window.open(article.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      role='button'
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleOpen()
        }
      }}
      className='group relative cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-all duration-300 hover:border-border/80 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
    >
      <div className='flex flex-col gap-6 p-5 md:flex-row'>
        {/* image */}
        <div className='relative h-40 w-full shrink-0 overflow-hidden rounded-xl md:w-56'>
          <img
            src={article.imageUrl}
            alt={article.headline}
            className='h-full w-full object-cover transition-transform duration-500 group-hover:scale-105'
          />
          {/* Category Chip */}
          <div
            className={`absolute left-2 top-2 rounded-lg border px-2 py-1 text-[10px] font-bold backdrop-blur-md ${
              theme === 'dark'
                ? 'border-white/10 bg-black/60 text-white'
                : 'border-gray-200 bg-white/80 text-gray-900'
            }`}
          >
            {article.category}
          </div>
        </div>

        {/* Content */}
        <div className='min-w-0 flex-1'>
          <div className='mb-2 flex items-start justify-between gap-4'>
            <h3 className='text-lg font-bold leading-tight transition-colors group-hover:text-primary'>
              {article.headline}
            </h3>
            <button
              onClick={handleToggleSave}
              onKeyDown={(e) => e.stopPropagation()}
              className={`rounded-md border p-2 transition-all ${
                article.isSaved
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              <FiBookmark className={article.isSaved ? 'fill-primary' : ''} />
            </button>
          </div>

          <div className='mb-4 flex flex-wrap items-center gap-2'>
            <span
              className={`rounded-md border px-2 py-0.5 text-[10px] font-bold transition-colors ${getSentimentColor(article.sentiment)}`}
            >
              {article.sentiment}
            </span>
            <div className='ml-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground'>
              <FiClock className='opacity-70' />
              {formatTimeAgo(article.publishedAt)}
            </div>
            <div className='ml-2 text-[11px] font-bold text-muted-foreground'>
              {article.source}
            </div>
            {article.isRead && (
              <span className='ml-auto rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground/50'>
                READ
              </span>
            )}
          </div>

          {/* User Context Badges */}
          <div className='mb-4 flex gap-2'>
            {article.userContext.inPortfolio && (
              <span className='rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[10px] font-bold text-blue-500'>
                In Portfolio
              </span>
            )}
            {article.userContext.inWatchlist && (
              <span className='rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-500'>
                In Watchlist
              </span>
            )}
          </div>

          {/* Summary Bullets */}
          <ul className='mb-4 space-y-2'>
            {article.summaryBullets.map((bullet, idx) => (
              <li
                key={idx}
                className='flex gap-3 text-sm leading-relaxed text-muted-foreground'
              >
                <span className='mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40' />
                {bullet}
              </li>
            ))}
          </ul>

          {/* Footer */}
          <div className='flex items-center gap-3 overflow-hidden border-t border-border pt-4'>
            {article.relatedSymbols.slice(0, 5).map((sym) => (
              <div
                key={sym}
                className='cursor-pointer rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground'
              >
                {sym}
              </div>
            ))}
            {article.relatedSymbols.length > 5 && (
              <span className='text-[10px] font-bold text-muted-foreground'>
                +{article.relatedSymbols.length - 5} MORE
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
