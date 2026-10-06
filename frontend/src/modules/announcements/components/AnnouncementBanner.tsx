import { useEffect, useRef } from 'react'
import { FiAlertOctagon, FiAlertTriangle, FiInfo, FiX } from 'react-icons/fi'
import { useAnnouncements } from '../hooks/useAnnouncements'
import { SEVERITY_STYLES } from '../styles'
import { AnnouncementSeverity, type Announcement } from '../types'
import { AnnouncementCta } from './AnnouncementCta'

const ICONS: Record<AnnouncementSeverity, typeof FiInfo> = {
  [AnnouncementSeverity.INFO]: FiInfo,
  [AnnouncementSeverity.WARNING]: FiAlertTriangle,
  [AnnouncementSeverity.CRITICAL]: FiAlertOctagon,
}

/** Sticky notice across the top of the app. Pushes the page down while it is shown. */
export function AnnouncementBanner({
  announcement,
}: {
  readonly announcement: Announcement
}) {
  const { dismiss } = useAnnouncements()
  const ref = useRef<HTMLDivElement>(null)
  const severity = announcement.severity ?? AnnouncementSeverity.INFO
  const Icon = ICONS[severity]

  useEffect(() => {
    const previous = document.body.style.paddingTop
    document.body.style.paddingTop = `${ref.current?.offsetHeight ?? 0}px`
    return () => {
      document.body.style.paddingTop = previous
    }
  }, [announcement.id])

  const close = () => void dismiss(announcement.id)

  return (
    <div
      ref={ref}
      role={severity === AnnouncementSeverity.CRITICAL ? 'alert' : 'status'}
      className={`fixed inset-x-0 top-0 z-[100] flex items-center gap-3 border-b px-4 py-2 text-sm ${SEVERITY_STYLES[severity]}`}
    >
      <Icon className='shrink-0' aria-hidden />
      <p className='min-w-0 flex-1 break-words'>
        <span className='font-semibold'>{announcement.title}</span>
        {announcement.body && <span className='ml-2'>{announcement.body}</span>}
      </p>
      {announcement.ctaLabel && announcement.ctaUrl && (
        <AnnouncementCta
          label={announcement.ctaLabel}
          url={announcement.ctaUrl}
          className='shrink-0 font-semibold underline underline-offset-2'
          onFollow={announcement.dismissible ? close : undefined}
        />
      )}
      {announcement.dismissible && (
        <button
          type='button'
          aria-label='Dismiss announcement'
          onClick={close}
          className='shrink-0 rounded p-1 hover:bg-black/10'
        >
          <FiX aria-hidden />
        </button>
      )}
    </div>
  )
}
