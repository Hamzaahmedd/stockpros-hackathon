import { useCallback } from 'react'
import type { Announcement } from '../types'
import { navKeyForPath } from '../utils'
import { useAnnouncements } from './useAnnouncements'

export interface NavBadge {
  /** The badge to draw on this nav entry, or null when it has none. */
  badge: Announcement | null
  /** Call when the user follows the nav entry: visiting it clears a dismissible badge. */
  onVisit: () => void
}

export const useNavBadge = (path: string): NavBadge => {
  const { boot, dismiss } = useAnnouncements()
  const navKey = navKeyForPath(path)
  const badge =
    (navKey && boot?.badges.find((item) => item.navKey === navKey)) || null

  const onVisit = useCallback(() => {
    if (badge?.dismissible) void dismiss(badge.id)
  }, [badge, dismiss])

  return { badge, onVisit }
}
