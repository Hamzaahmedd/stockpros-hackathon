import { Modal } from '@/shared/components/Modal'
import { useEffect } from 'react'
import { useAnnouncements } from '../hooks/useAnnouncements'
import type { Announcement } from '../types'
import { AnnouncementCta } from './AnnouncementCta'

const CTA_CLASS =
  'inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90'
const DISMISS_CLASS =
  'inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground'

/** The "What's new" overlay. Closing it (button, Escape or backdrop) dismisses it for good. */
export function AnnouncementModal({
  announcement,
}: {
  readonly announcement: Announcement
}) {
  const { dismiss, markSeen } = useAnnouncements()
  const { id } = announcement

  // Showing it counts as reading it, so the bell's unread count drops.
  useEffect(() => {
    if (announcement.unread) void markSeen(id)
  }, [id, announcement.unread, markSeen])

  const close = () => void dismiss(id)

  return (
    <Modal
      isOpen
      onClose={close}
      title={announcement.title}
      widthClass='max-w-lg'
    >
      {announcement.imageUrl && (
        <img
          src={announcement.imageUrl}
          alt=''
          className='mb-4 max-h-56 w-full rounded-lg object-cover'
          referrerPolicy='no-referrer'
        />
      )}
      <p className='whitespace-pre-wrap break-words text-sm text-muted-foreground'>
        {announcement.body}
      </p>
      <div className='mt-6 flex flex-wrap justify-end gap-2'>
        <button type='button' className={DISMISS_CLASS} onClick={close}>
          Got it
        </button>
        {announcement.ctaLabel && announcement.ctaUrl && (
          <AnnouncementCta
            label={announcement.ctaLabel}
            url={announcement.ctaUrl}
            className={CTA_CLASS}
            onFollow={close}
          />
        )}
      </div>
    </Modal>
  )
}
