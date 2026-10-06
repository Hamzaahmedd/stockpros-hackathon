import {
  AnnouncementPlacement,
  type Announcement,
  type AnnouncementBoot,
} from './types'

let counter = 0

export const makeAnnouncement = (
  overrides: Partial<Announcement> = {},
): Announcement => {
  counter += 1
  return {
    id: `announcement-${counter}`,
    title: `Title ${counter}`,
    body: 'Body text',
    ctaLabel: null,
    ctaUrl: null,
    imageUrl: null,
    placement: AnnouncementPlacement.MODAL,
    severity: null,
    anchor: null,
    navKey: null,
    priority: 0,
    dismissible: true,
    publishedAt: '2026-10-07T12:00:00.000Z',
    unread: true,
    ...overrides,
  }
}

export const makeBoot = (
  overrides: Partial<AnnouncementBoot> = {},
): AnnouncementBoot => ({
  modal: null,
  banner: null,
  spotlight: null,
  badges: [],
  changelog: { items: [], unreadCount: 0 },
  ...overrides,
})

/** A boot payload whose changelog lists the given announcements, all unread. */
export const bootWithChangelog = (
  items: Announcement[],
  overrides: Partial<AnnouncementBoot> = {},
): AnnouncementBoot =>
  makeBoot({
    changelog: {
      items,
      unreadCount: items.filter((item) => item.unread).length,
    },
    ...overrides,
  })
