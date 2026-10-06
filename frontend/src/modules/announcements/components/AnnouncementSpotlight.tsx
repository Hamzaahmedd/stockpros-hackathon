import { useEscapeToClose } from '@/shared/hooks/useEscapeToClose'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiX } from 'react-icons/fi'
import { useAnnouncements } from '../hooks/useAnnouncements'
import type { Announcement } from '../types'
import { findAnchorElement } from '../utils'
import { AnnouncementCta } from './AnnouncementCta'

const POPOVER_WIDTH = 320
const POPOVER_GAP = 12
const VIEWPORT_MARGIN = 8
/** The anchor may mount or unmount as the page changes; look again this often. */
const ANCHOR_POLL_MS = 750

interface Placement {
  top: number
  left: number
  target: DOMRect
}

const measure = (announcement: Announcement): Placement | null => {
  if (!announcement.anchor) return null
  const element = findAnchorElement(announcement.anchor)
  if (!element) return null
  const target = element.getBoundingClientRect()
  if (target.width === 0 && target.height === 0) return null

  const maxLeft = window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN
  return {
    target,
    left: Math.max(VIEWPORT_MARGIN, Math.min(target.left, maxLeft)),
    top: target.bottom + POPOVER_GAP,
  }
}

const samePlacement = (a: Placement | null, b: Placement | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.top === b.top &&
    a.left === b.left &&
    a.target.x === b.target.x &&
    a.target.y === b.target.y &&
    a.target.width === b.target.width &&
    a.target.height === b.target.height)

/**
 * A callout pointing at a known element. It only appears while that element is
 * on screen, and a spotlight whose anchor is not on this page is left alone
 * (not dismissed), so it shows up where it applies.
 */
export function AnnouncementSpotlight({
  announcement,
}: {
  readonly announcement: Announcement
}) {
  const { dismiss, markSeen } = useAnnouncements()
  const [placement, setPlacement] = useState<Placement | null>(null)
  const { id, unread } = announcement
  const visible = placement !== null

  useEffect(() => {
    const update = () => {
      const next = measure(announcement)
      setPlacement((current) => (samePlacement(current, next) ? current : next))
    }
    update()
    const timer = window.setInterval(update, ANCHOR_POLL_MS)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [announcement])

  // Seen once it is actually on screen, not merely queued.
  useEffect(() => {
    if (visible && unread) void markSeen(id)
  }, [visible, unread, id, markSeen])

  const close = () => void dismiss(id)
  useEscapeToClose(visible, close)

  if (!placement) return null

  const { target } = placement
  return createPortal(
    <>
      <div
        aria-hidden
        className='pointer-events-none fixed z-[99990] rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background'
        style={{
          top: target.top - 2,
          left: target.left - 2,
          width: target.width + 4,
          height: target.height + 4,
        }}
      />
      <div
        role='dialog'
        aria-label={announcement.title}
        className='fixed z-[99991] rounded-xl border border-border bg-card p-4 text-card-foreground shadow-2xl'
        style={{
          top: placement.top,
          left: placement.left,
          width: POPOVER_WIDTH,
        }}
      >
        <button
          type='button'
          aria-label='Dismiss announcement'
          onClick={close}
          className='absolute right-2 top-2 rounded p-1 text-muted-foreground hover:text-foreground'
        >
          <FiX aria-hidden />
        </button>
        <p className='pr-6 text-sm font-semibold'>{announcement.title}</p>
        <p className='mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground'>
          {announcement.body}
        </p>
        <div className='mt-3 flex items-center justify-end gap-3'>
          <button
            type='button'
            onClick={close}
            className='text-xs font-medium text-muted-foreground hover:text-foreground'
          >
            Got it
          </button>
          {announcement.ctaLabel && announcement.ctaUrl && (
            <AnnouncementCta
              label={announcement.ctaLabel}
              url={announcement.ctaUrl}
              className='text-xs font-semibold text-primary hover:underline'
              onFollow={close}
            />
          )}
        </div>
      </div>
    </>,
    document.body,
  )
}
