import { Sidebar } from '@/shared/components/Sidebar'
import { useCallback, useEffect, useState } from 'react'
import { FiChevronDown, FiChevronUp, FiMessageSquare } from 'react-icons/fi'
import { toast } from 'react-toastify'
import { feedbackService } from '../services'
import {
  FeedbackStatus,
  type FeedbackListRow,
  type FeedbackStatusCounts,
} from '../types'
import { FEEDBACK_CATEGORY_LABELS } from '../utils'

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

/** The "All" tab shows every status. */
const ALL = 'ALL'
type Tab = FeedbackStatus | typeof ALL

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: FeedbackStatus.NEW, label: 'New' },
  { id: FeedbackStatus.READ, label: 'Read' },
  { id: FeedbackStatus.ARCHIVED, label: 'Archived' },
  { id: ALL, label: 'All' },
]

const EMPTY_COUNTS: FeedbackStatusCounts = {
  [FeedbackStatus.NEW]: 0,
  [FeedbackStatus.READ]: 0,
  [FeedbackStatus.ARCHIVED]: 0,
}

const EMPTY_LABELS: Readonly<Record<Tab, string>> = {
  [FeedbackStatus.NEW]: 'Nothing new. You are all caught up.',
  [FeedbackStatus.READ]: 'No read feedback.',
  [FeedbackStatus.ARCHIVED]: 'No archived feedback.',
  [ALL]: 'No feedback submitted yet.',
}

interface RowAction {
  label: string
  to: FeedbackStatus
}

/** What an admin can do next with an entry in each state. */
const ACTIONS: Readonly<Record<FeedbackStatus, readonly RowAction[]>> = {
  [FeedbackStatus.NEW]: [
    { label: 'Mark read', to: FeedbackStatus.READ },
    { label: 'Archive', to: FeedbackStatus.ARCHIVED },
  ],
  [FeedbackStatus.READ]: [
    { label: 'Mark unread', to: FeedbackStatus.NEW },
    { label: 'Archive', to: FeedbackStatus.ARCHIVED },
  ],
  [FeedbackStatus.ARCHIVED]: [
    { label: 'Restore to New', to: FeedbackStatus.NEW },
  ],
}

function TechnicalDetails({ entry }: Readonly<{ entry: FeedbackListRow }>) {
  const { metadata } = entry
  const rows: Array<[string, string]> = metadata
    ? [
        ['Plan', metadata.planTier ?? '—'],
        ['Browser', metadata.userAgent ?? '—'],
        [
          'Window',
          metadata.viewport
            ? `${metadata.viewport.width} × ${metadata.viewport.height}`
            : '—',
        ],
        ['App version', metadata.appVersion ?? '—'],
      ]
    : []

  if (rows.length === 0) {
    return (
      <p className='text-xs text-muted-foreground'>
        No technical details were sent with this one.
      </p>
    )
  }
  return (
    <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs'>
      {rows.map(([label, value]) => (
        <div key={label} className='contents'>
          <dt className='font-semibold text-muted-foreground'>{label}</dt>
          <dd className='break-all font-mono'>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

const FeedbackList = () => {
  const [tab, setTab] = useState<Tab>(FeedbackStatus.NEW)
  const [entries, setEntries] = useState<FeedbackListRow[]>([])
  const [counts, setCounts] = useState<FeedbackStatusCounts>(EMPTY_COUNTS)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [updating, setUpdating] = useState<string | null>(null)

  const status = tab === ALL ? undefined : tab

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await feedbackService.list({ status })
      setEntries(result.data)
      setNextCursor(result.nextCursor)
      setHasMore(result.hasMore)
      setTotal(result.total)
      setCounts(result.counts)
    } catch (err) {
      console.error('Error fetching feedback:', err)
      toast.error('Failed to load feedback')
    } finally {
      setLoading(false)
    }
  }, [status])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await feedbackService.list({ cursor: nextCursor, status })
      setEntries((prev) => [...prev, ...result.data])
      setNextCursor(result.nextCursor)
      setHasMore(result.hasMore)
    } catch (err) {
      console.error('Error loading more feedback:', err)
      toast.error('Failed to load more feedback')
    } finally {
      setLoadingMore(false)
    }
  }

  const changeStatus = async (entry: FeedbackListRow, to: FeedbackStatus) => {
    setUpdating(entry.id)
    try {
      await feedbackService.setStatus(entry.id, to)
      await fetchData()
    } catch (err) {
      console.error('Error updating feedback status:', err)
      toast.error('Could not update this feedback')
    } finally {
      setUpdating(null)
    }
  }

  const toggleDetails = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const everything =
    counts[FeedbackStatus.NEW] +
    counts[FeedbackStatus.READ] +
    counts[FeedbackStatus.ARCHIVED]
  const tabCount = (id: Tab): number => (id === ALL ? everything : counts[id])

  return (
    <div className='font-inter flex h-screen flex-col overflow-hidden bg-background text-foreground lg:flex-row'>
      <Sidebar />

      <main
        id='main-content'
        className='flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-10'
      >
        <div className='mx-auto max-w-[1200px] space-y-6'>
          {/* Header */}
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='flex items-center gap-3 text-2xl font-bold tracking-tight md:text-3xl'>
                <FiMessageSquare className='text-primary' />
                User Feedback
              </h1>
              <div className='mt-1 text-sm font-medium text-muted-foreground'>
                {total} submission{total === 1 ? '' : 's'} in this view
              </div>
            </div>
          </div>

          {/* Status tabs */}
          <div
            role='tablist'
            aria-label='Feedback status'
            className='flex flex-wrap gap-2 border-b border-border pb-3'
          >
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type='button'
                role='tab'
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                  tab === id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                }`}
              >
                {label}{' '}
                <span className='ml-1 text-xs opacity-80'>{tabCount(id)}</span>
              </button>
            ))}
          </div>

          {/* ================= FEEDBACK TABLE ================= */}
          <div className='overflow-hidden rounded-lg border border-border bg-card shadow-md'>
            <div className='overflow-x-auto'>
              <div className='min-w-[1000px]'>
                {/* Table Header */}
                <div className='grid grid-cols-[1.2fr_1.3fr_3fr_0.9fr_1.1fr_1.4fr] border-b border-border bg-muted/30 px-8 py-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                  <div>Name</div>
                  <div>Email</div>
                  <div>Message</div>
                  <div>Page</div>
                  <div>Submitted</div>
                  <div>Actions</div>
                </div>

                {loading ? (
                  <div className='animate-pulse py-20 text-center text-muted-foreground'>
                    Loading feedback...
                  </div>
                ) : entries.length === 0 ? (
                  <div className='py-20 text-center text-muted-foreground'>
                    {EMPTY_LABELS[tab]}
                  </div>
                ) : (
                  entries.map((entry) => {
                    const open = expanded.has(entry.id)
                    return (
                      <div
                        key={entry.id}
                        className='border-b border-border px-8 py-4 transition-colors duration-200 hover:bg-muted/30'
                      >
                        <div className='grid grid-cols-[1.2fr_1.3fr_3fr_0.9fr_1.1fr_1.4fr] items-start'>
                          <div className='truncate pr-2 text-sm font-bold'>
                            {entry.user.displayName}
                          </div>
                          <div className='truncate pr-2 text-sm font-medium text-muted-foreground'>
                            {entry.user.email}
                          </div>
                          <div className='pr-4'>
                            <div className='mb-1 flex flex-wrap gap-1.5'>
                              {entry.category && (
                                <span className='rounded-md bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide'>
                                  {FEEDBACK_CATEGORY_LABELS[entry.category]}
                                </span>
                              )}
                              {tab === ALL && (
                                <span className='rounded-md border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground'>
                                  {entry.status}
                                </span>
                              )}
                            </div>
                            <div className='whitespace-pre-wrap break-words text-sm'>
                              {entry.message}
                            </div>
                          </div>
                          <div className='truncate font-mono text-xs text-muted-foreground'>
                            {entry.page || '—'}
                          </div>
                          <div className='whitespace-nowrap text-xs font-medium text-muted-foreground'>
                            {formatDate(entry.createdAt)}
                          </div>
                          <div className='flex flex-wrap gap-1.5'>
                            {ACTIONS[entry.status].map((action) => (
                              <button
                                key={action.to}
                                type='button'
                                disabled={updating === entry.id}
                                onClick={() =>
                                  void changeStatus(entry, action.to)
                                }
                                className='rounded-md border border-border bg-secondary px-3 py-1 text-[11px] font-bold transition-all hover:bg-secondary/80 disabled:opacity-50'
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          type='button'
                          aria-expanded={open}
                          onClick={() => toggleDetails(entry.id)}
                          className='mt-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground'
                        >
                          {open ? (
                            <FiChevronUp aria-hidden />
                          ) : (
                            <FiChevronDown aria-hidden />
                          )}
                          Technical details
                        </button>
                        {open && (
                          <div className='mt-2 rounded-md bg-muted/30 p-3'>
                            <TechnicalDetails entry={entry} />
                          </div>
                        )}
                      </div>
                    )
                  })
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
