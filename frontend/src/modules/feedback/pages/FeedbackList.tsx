import { useEffect, useState } from 'react'
import { FiMessageSquare } from 'react-icons/fi'
import { Sidebar } from '@/shared/components/Sidebar'
import { feedbackService } from '../services'
import type { FeedbackListRow } from '../types'

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

const FeedbackList = () => {
  const [entries, setEntries] = useState<FeedbackListRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const result = await feedbackService.list()
      setEntries(result.data)
      setNextCursor(result.nextCursor)
      setHasMore(result.hasMore)
      setTotal(result.total)
    } catch (err) {
      console.error('Error fetching feedback:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await feedbackService.list(nextCursor)
      setEntries((prev) => [...prev, ...result.data])
      setNextCursor(result.nextCursor)
      setHasMore(result.hasMore)
    } catch (err) {
      console.error('Error loading more feedback:', err)
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return (
    <div className='font-inter flex h-screen flex-col overflow-hidden bg-background text-foreground lg:flex-row'>
      <Sidebar />

      <main
        id='main-content'
        className='flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-10'
      >
        <div className='mx-auto max-w-[1200px] space-y-10'>
          {/* Header */}
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='flex items-center gap-3 text-2xl font-bold tracking-tight md:text-3xl'>
                <FiMessageSquare className='text-primary' />
                User Feedback
              </h1>
              <div className='mt-1 text-sm font-medium text-muted-foreground'>
                {total} total submission{total === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          {/* ================= FEEDBACK TABLE ================= */}
          <div className='overflow-hidden rounded-lg border border-border bg-card shadow-md'>
            <div className='overflow-x-auto'>
              <div className='min-w-[900px]'>
                {/* Table Header */}
                <div className='grid grid-cols-[1.4fr_1.4fr_3fr_1fr_1.2fr] border-b border-border bg-muted/30 px-8 py-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                  <div>Name</div>
                  <div>Email</div>
                  <div>Message</div>
                  <div>Page</div>
                  <div>Submitted</div>
                </div>

                {loading ? (
                  <div className='animate-pulse py-20 text-center text-muted-foreground'>
                    Loading feedback...
                  </div>
                ) : entries.length === 0 ? (
                  <div className='py-20 text-center text-muted-foreground'>
                    No feedback submitted yet.
                  </div>
                ) : (
                  entries.map((entry) => (
                    <div
                      key={entry.id}
                      className='grid grid-cols-[1.4fr_1.4fr_3fr_1fr_1.2fr] items-start border-b border-border px-8 py-4 transition-colors duration-200 hover:bg-muted/30'
                    >
                      <div className='truncate text-sm font-bold'>
                        {entry.user.displayName}
                      </div>
                      <div className='truncate text-sm font-medium text-muted-foreground'>
                        {entry.user.email}
                      </div>
                      <div className='whitespace-pre-wrap break-words text-sm'>
                        {entry.message}
                      </div>
                      <div className='truncate font-mono text-xs text-muted-foreground'>
                        {entry.page || '—'}
                      </div>
                      <div className='whitespace-nowrap text-xs font-medium text-muted-foreground'>
                        {formatDate(entry.createdAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            {/* Load More */}
            {hasMore && (
              <div className='flex justify-center border-t border-border bg-muted/10 px-8 py-4'>
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className='rounded-md border border-border bg-secondary px-6 py-2 text-[10px] font-bold uppercase tracking-wider transition-all hover:bg-secondary/80 disabled:opacity-50'
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default FeedbackList
