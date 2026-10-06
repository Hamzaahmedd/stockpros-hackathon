export const ANNOUNCEMENT_CACHE_KEYS = {
  ACTIVE_LIST: 'announcements:active',
  userState: (userId: string): string => `announcements:state:${userId}`,
} as const

/** Marks a per-user Redis hash as hydrated, so an empty state is not mistaken for a cold cache. */
export const USER_STATE_SENTINEL_FIELD = '_'

/** Hard ceiling on announcements held in the shared active list. */
export const ACTIVE_LIST_MAX = 200

export const CHANGELOG_BOOT_LIMIT = 20
export const CHANGELOG_MAX_PAGE_SIZE = 50
export const CHANGELOG_DEFAULT_PAGE_SIZE = 20
