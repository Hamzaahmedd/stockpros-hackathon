// Mirrors the backend announcements module (enums come from prisma/schema.prisma).

export enum AnnouncementPlacement {
  MODAL = 'MODAL',
  SPOTLIGHT = 'SPOTLIGHT',
  BANNER = 'BANNER',
  BADGE = 'BADGE',
  CHANGELOG = 'CHANGELOG',
}

export enum AnnouncementSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

/** Fixed UI hooks a spotlight may point at; the page marks the element with `data-announce-anchor`. */
export enum AnnouncementAnchor {
  NOTIFICATION_BELL = 'NOTIFICATION_BELL',
  SIDEBAR_WORKSPACE = 'SIDEBAR_WORKSPACE',
  WATCHLIST_ADD = 'WATCHLIST_ADD',
  FORECAST_PANEL = 'FORECAST_PANEL',
  PLANS_UPGRADE = 'PLANS_UPGRADE',
  SETTINGS_PREFERENCES = 'SETTINGS_PREFERENCES',
}

/** Sidebar entries a badge may decorate. */
export enum AnnouncementNavKey {
  DASHBOARD = 'DASHBOARD',
  WATCHLIST = 'WATCHLIST',
  MARKET = 'MARKET',
  FORECAST = 'FORECAST',
  NEWS = 'NEWS',
  PLANS = 'PLANS',
  WORKSPACE = 'WORKSPACE',
  SETTINGS = 'SETTINGS',
}

export interface Announcement {
  id: string
  title: string
  /** Plain text. Always render it as text, never as HTML. */
  body: string
  ctaLabel: string | null
  /** An in-app path or an https URL. */
  ctaUrl: string | null
  imageUrl: string | null
  placement: AnnouncementPlacement
  severity: AnnouncementSeverity | null
  anchor: AnnouncementAnchor | null
  navKey: AnnouncementNavKey | null
  priority: number
  dismissible: boolean
  publishedAt: string
  unread: boolean
}

export interface AnnouncementChangelog {
  items: Announcement[]
  unreadCount: number
}

/** What the backend evaluated for this user: one winner per interruptive placement. */
export interface AnnouncementBoot {
  modal: Announcement | null
  banner: Announcement | null
  spotlight: Announcement | null
  badges: Announcement[]
  changelog: AnnouncementChangelog
}
