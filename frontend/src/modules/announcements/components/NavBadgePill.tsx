import type { Announcement } from '../types'

/** The "New" marker on a sidebar entry. Collapsed, it shrinks to a dot over the icon. */
export function NavBadgePill({
  badge,
  collapsed,
}: {
  readonly badge: Announcement
  readonly collapsed: boolean
}) {
  if (collapsed) {
    return (
      <span
        role='status'
        aria-label={`New: ${badge.title}`}
        className='absolute right-2 top-1.5 h-2 w-2 rounded-full bg-primary'
      />
    )
  }
  return (
    <span
      role='status'
      title={badge.title}
      className='ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground'
    >
      New
    </span>
  )
}
