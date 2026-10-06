import { describe, expect, it } from 'vitest'
import { bootWithChangelog, makeAnnouncement } from './test-fixtures'
import { AnnouncementAnchor, AnnouncementNavKey } from './types'
import {
  ANCHOR_ATTRIBUTE,
  anchorProps,
  applyAllSeen,
  applyDismissed,
  applySeen,
  findAnchorElement,
  isAuthFlowPath,
  isInternalPath,
  navKeyForPath,
} from './utils'

describe('navKeyForPath', () => {
  it.each([
    ['/dashboard', AnnouncementNavKey.DASHBOARD],
    ['/watchlist', AnnouncementNavKey.WATCHLIST],
    ['/market', AnnouncementNavKey.MARKET],
    ['/forecast', AnnouncementNavKey.FORECAST],
    ['/news', AnnouncementNavKey.NEWS],
    ['/plans', AnnouncementNavKey.PLANS],
    ['/teams', AnnouncementNavKey.WORKSPACE],
    ['/settings', AnnouncementNavKey.SETTINGS],
  ])('maps %s to %s', (path, key) => {
    expect(navKeyForPath(path)).toBe(key)
  })

  it('returns null for routes without a badge slot', () => {
    expect(navKeyForPath('/admin')).toBeNull()
    expect(navKeyForPath('/unknown')).toBeNull()
  })
})

describe('isInternalPath', () => {
  it('routes in-app paths and refuses protocol-relative and external URLs', () => {
    expect(isInternalPath('/plans')).toBe(true)
    expect(isInternalPath('//evil.example')).toBe(false)
    expect(isInternalPath('https://example.com')).toBe(false)
  })
})

describe('isAuthFlowPath', () => {
  it.each(['/login', '/auth/verify', '/auth/onboarding'])(
    'treats %s as the sign-in flow',
    (path) => expect(isAuthFlowPath(path)).toBe(true),
  )
  it.each(['/dashboard', '/authors', '/'])('treats %s as the app', (path) =>
    expect(isAuthFlowPath(path)).toBe(false),
  )
})

describe('anchors', () => {
  it('finds the element marked with the anchor attribute', () => {
    document.body.innerHTML = `<button ${ANCHOR_ATTRIBUTE}="${AnnouncementAnchor.WATCHLIST_ADD}">Add</button>`
    expect(
      findAnchorElement(AnnouncementAnchor.WATCHLIST_ADD)?.textContent,
    ).toBe('Add')
    expect(findAnchorElement(AnnouncementAnchor.FORECAST_PANEL)).toBeNull()
    document.body.innerHTML = ''
  })

  it('builds the attribute for a page to spread', () => {
    expect(anchorProps(AnnouncementAnchor.PLANS_UPGRADE)).toEqual({
      [ANCHOR_ATTRIBUTE]: AnnouncementAnchor.PLANS_UPGRADE,
    })
  })
})

describe('optimistic updates', () => {
  const a = makeAnnouncement()
  const b = makeAnnouncement()
  const c = makeAnnouncement({ unread: false })

  it('applySeen marks one entry read and lowers the count once', () => {
    const next = applySeen(bootWithChangelog([a, b, c]), a.id)
    expect(next.changelog.items.map((item) => item.unread)).toEqual([
      false,
      true,
      false,
    ])
    expect(next.changelog.unreadCount).toBe(1)
  })

  it('applySeen on an already-read entry changes nothing', () => {
    expect(
      applySeen(bootWithChangelog([a, b, c]), c.id).changelog.unreadCount,
    ).toBe(2)
  })

  it('applySeen never takes the count below zero', () => {
    const boot = bootWithChangelog([a])
    boot.changelog.unreadCount = 0
    expect(applySeen(boot, a.id).changelog.unreadCount).toBe(0)
  })

  it('applyAllSeen clears every unread flag', () => {
    const next = applyAllSeen(bootWithChangelog([a, b, c]))
    expect(next.changelog.items.every((item) => !item.unread)).toBe(true)
    expect(next.changelog.unreadCount).toBe(0)
  })

  it('applyDismissed clears the item from every interruptive slot and marks it read', () => {
    const boot = bootWithChangelog([a, b], {
      modal: a,
      banner: a,
      spotlight: b,
      badges: [a, b],
    })
    const next = applyDismissed(boot, a.id)
    expect(next.modal).toBeNull()
    expect(next.banner).toBeNull()
    expect(next.spotlight).toBe(b)
    expect(next.badges).toEqual([b])
    expect(next.changelog.items[0].unread).toBe(false)
    expect(next.changelog.unreadCount).toBe(1)
  })

  it('does not mutate the previous payload (so a rollback is exact)', () => {
    const boot = bootWithChangelog([a], { modal: a })
    applyDismissed(boot, a.id)
    expect(boot.modal).toBe(a)
    expect(boot.changelog.items[0].unread).toBe(true)
  })
})
