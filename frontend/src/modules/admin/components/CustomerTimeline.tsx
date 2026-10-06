import { Modal } from '@/shared/components/Modal'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { adminService } from '../services'
import type { TimelineEvent } from '../types'
import { apiErrorMessage, formatDateTime } from '../utils'

interface Props {
  userId: string
  onClose: () => void
}

/**
 * Support history for one customer: payments, credit movements, sign-ins,
 * workspace changes and staff actions, newest first. Product usage analytics
 * live in PostHog, not here.
 */
export function CustomerTimeline({ userId, onClose }: Readonly<Props>) {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(
    async (before?: string) => {
      try {
        const page = await adminService.getTimeline(userId, before)
        setEvents((current) =>
          before && current ? [...current, ...page.items] : page.items,
        )
        setNextBefore(page.nextBefore)
      } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to load timeline'))
        setEvents((current) => current ?? [])
      }
    },
    [userId],
  )

  useEffect(() => {
    void load()
  }, [load])

  const loadMore = async () => {
    if (!nextBefore) return
    setLoadingMore(true)
    await load(nextBefore)
    setLoadingMore(false)
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title='Customer timeline'
      widthClass='max-w-2xl'
    >
      {events === null && <Skeleton className='h-40 w-full' />}
      {events?.length === 0 && (
        <p className='text-sm text-muted-foreground'>No recorded activity.</p>
      )}
      {events && events.length > 0 && (
        <ol className='space-y-3'>
          {events.map((event) => (
            <li
              key={`${event.type}-${event.id}`}
              className='rounded-lg border border-border p-3 text-sm'
            >
              <div className='flex flex-wrap items-center gap-2'>
                <Badge variant='secondary'>
                  {event.type.replace('_', ' ')}
                </Badge>
                <span className='font-medium'>{event.title}</span>
                {event.ticketRef && <Badge>{event.ticketRef}</Badge>}
                <time
                  className='ml-auto text-xs text-muted-foreground'
                  dateTime={event.at}
                >
                  {formatDateTime(event.at)}
                </time>
              </div>
              {event.detail && (
                <p className='mt-1 text-muted-foreground'>{event.detail}</p>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className='mt-4 flex justify-end gap-2'>
        {nextBefore && (
          <Button
            type='button'
            variant='outline'
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? 'Loading…' : 'Load older'}
          </Button>
        )}
        <Button type='button' variant='ghost' onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}
