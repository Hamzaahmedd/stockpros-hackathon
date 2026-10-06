import {
  AnnouncementNavKey,
  type Announcement,
  type AnnouncementAnchor,
  type AnnouncementBoot,
} from './types'

/** Attribute a page puts on an element so a spotlight can point at it. */
export const ANCHOR_ATTRIBUTE = 'data-announce-anchor'

export const anchorProps = (anchor: AnnouncementAnchor) => ({
  [ANCHOR_ATTRIBUTE]: anchor,
})

export const findAnchorElement = (
  anchor: AnnouncementAnchor,
): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[${ANCHOR_ATTRIBUTE}="${anchor}"]`)

/** Sidebar routes that can carry a badge. */
const NAV_KEY_BY_PATH: Readonly<Record<string, AnnouncementNavKey>> = {
  '/dashboard': AnnouncementNavKey.DASHBOARD,
  '/watchlist': AnnouncementNavKey.WATCHLIST,
  '/market': AnnouncementNavKey.MARKET,
  '/forecast': AnnouncementNavKey.FORECAST,
  '/news': AnnouncementNavKey.NEWS,
  '/plans': AnnouncementNavKey.PLANS,
  '/teams': AnnouncementNavKey.WORKSPACE,
  '/settings': AnnouncementNavKey.SETTINGS,
}

export const navKeyForPath = (path: string): AnnouncementNavKey | null =>
  NAV_KEY_BY_PATH[path] ?? null

/** Only in-app paths are routed; everything else is an external https link. */
export const isInternalPath = (url: string): boolean =>
  url.startsWith('/') && !url.startsWith('//')

/** Interruptive announcements are not shown while signing in or onboarding. */
export const isAuthFlowPath = (pathname: string): boolean =>
  pathname === '/login' || pathname === '/auth' || pathname.startsWith('/auth/')

// ─── Optimistic updates ─────────────────────────────────────────────────────
// Pure transforms of the boot payload, applied before the server confirms.

const markRead = (
  boot: AnnouncementBoot,
  isTarget: (item: Announcement) => boolean,
): AnnouncementBoot => {
  const newlyRead = boot.changelog.items.filter(
    (item) => item.unread && isTarget(item),
  ).length
  return {
    ...boot,
    changelog: {
      items: boot.changelog.items.map((item) =>
        isTarget(item) ? { ...item, unread: false } : item,
      ),
      unreadCount: Math.max(0, boot.changelog.unreadCount - newlyRead),
    },
  }
}

export const applySeen = (
  boot: AnnouncementBoot,
  id: string,
): AnnouncementBoot => markRead(boot, (item) => item.id === id)

export const applyAllSeen = (boot: AnnouncementBoot): AnnouncementBoot => ({
  ...boot,
  changelog: {
    items: boot.changelog.items.map((item) => ({ ...item, unread: false })),
    unreadCount: 0,
  },
})

/** A dismissal removes the item from every interruptive slot and marks it read in the changelog. */
export const applyDismissed = (
  boot: AnnouncementBoot,
  id: string,
): AnnouncementBoot => {
  const keep = (item: Announcement | null) => (item?.id === id ? null : item)
  return {
    ...applySeen(boot, id),
    modal: keep(boot.modal),
    banner: keep(boot.banner),
    spotlight: keep(boot.spotlight),
    badges: boot.badges.filter((badge) => badge.id !== id),
  }
}
