import {
  AnnouncementPlacement,
  AnnouncementPlanTarget,
  PlanTier,
  TeamRole,
} from '@prisma/client'
import { CHANGELOG_BOOT_LIMIT } from '../constants'
import {
  buildChangelog,
  eligibleFor,
  evaluateForUser,
  isInWindow,
  matchesAudience,
} from '../targeting'
import type { UserAnnouncementState } from '../types'
import { makeAnnouncement, NOW_MS, OWNER_FREE } from './fixtures'

const states = (entries: Array<[string, UserAnnouncementState]> = []) =>
  new Map(entries)

describe('isInWindow', () => {
  it('treats open ends as unbounded', () => {
    expect(isInWindow(makeAnnouncement(), NOW_MS)).toBe(true)
  })

  it('includes startsAt and excludes endsAt', () => {
    const item = makeAnnouncement({ startsAtMs: NOW_MS, endsAtMs: NOW_MS + 10 })
    expect(isInWindow(item, NOW_MS - 1)).toBe(false)
    expect(isInWindow(item, NOW_MS)).toBe(true)
    expect(isInWindow(item, NOW_MS + 9)).toBe(true)
    expect(isInWindow(item, NOW_MS + 10)).toBe(false)
  })
})

describe('matchesAudience', () => {
  const plans = Object.values(PlanTier)
  const roles = Object.values(TeamRole)

  it.each(plans)('ALL reaches the %s plan', (plan) => {
    expect(
      matchesAudience(makeAnnouncement(), { plan, role: TeamRole.MEMBER }),
    ).toBe(true)
  })

  it.each(plans.flatMap((plan) => plans.map((viewer) => [plan, viewer])))(
    'a %s target is shown to a %s viewer only when they match',
    (target, viewer) => {
      const item = makeAnnouncement({
        targetPlans: [target as AnnouncementPlanTarget],
      })
      expect(
        matchesAudience(item, {
          plan: viewer as PlanTier,
          role: TeamRole.OWNER,
        }),
      ).toBe(target === viewer)
    },
  )

  it.each(roles)('an empty role list reaches %s', (role) => {
    expect(matchesAudience(makeAnnouncement(), { plan: 'PRO', role })).toBe(
      true,
    )
  })

  it.each(roles.flatMap((role) => roles.map((viewer) => [role, viewer])))(
    'a %s role target is shown to a %s viewer only when they match',
    (target, viewer) => {
      const item = makeAnnouncement({ targetRoles: [target as TeamRole] })
      expect(
        matchesAudience(item, { plan: 'PRO', role: viewer as TeamRole }),
      ).toBe(target === viewer)
    },
  )

  it('requires both the plan and the role to match', () => {
    const item = makeAnnouncement({
      targetPlans: [AnnouncementPlanTarget.TEAM],
      targetRoles: [TeamRole.ADMIN],
    })
    expect(matchesAudience(item, { plan: 'TEAM', role: TeamRole.MEMBER })).toBe(
      false,
    )
    expect(matchesAudience(item, { plan: 'PRO', role: TeamRole.ADMIN })).toBe(
      false,
    )
    expect(matchesAudience(item, { plan: 'TEAM', role: TeamRole.ADMIN })).toBe(
      true,
    )
  })
})

describe('evaluateForUser', () => {
  it('returns an empty payload when nothing is active', () => {
    expect(evaluateForUser([], OWNER_FREE, states(), NOW_MS)).toEqual({
      modal: null,
      banner: null,
      spotlight: null,
      badges: [],
      changelog: { items: [], unreadCount: 0 },
    })
  })

  it('picks one winner per interruptive placement by priority, then recency', () => {
    const low = makeAnnouncement({ priority: 1 })
    const high = makeAnnouncement({ priority: 5 })
    const newerTie = makeAnnouncement({
      priority: 5,
      publishedAtMs: NOW_MS - 1_000,
    })
    const banner = makeAnnouncement({ placement: AnnouncementPlacement.BANNER })
    const spotlight = makeAnnouncement({
      placement: AnnouncementPlacement.SPOTLIGHT,
    })

    const payload = evaluateForUser(
      [low, high, newerTie, banner, spotlight],
      OWNER_FREE,
      states(),
      NOW_MS,
    )

    expect(payload.modal?.id).toBe(newerTie.id)
    expect(payload.banner?.id).toBe(banner.id)
    expect(payload.spotlight?.id).toBe(spotlight.id)
  })

  it('returns every badge but hides dismissed ones', () => {
    const a = makeAnnouncement({ placement: AnnouncementPlacement.BADGE })
    const b = makeAnnouncement({ placement: AnnouncementPlacement.BADGE })
    const payload = evaluateForUser(
      [a, b],
      OWNER_FREE,
      states([[b.id, { epoch: 1, seen: true, dismissed: true }]]),
      NOW_MS,
    )
    expect(payload.badges.map((badge) => badge.id)).toEqual([a.id])
  })

  it('never re-shows a dismissed item', () => {
    const item = makeAnnouncement()
    const payload = evaluateForUser(
      [item],
      OWNER_FREE,
      states([[item.id, { epoch: 1, seen: true, dismissed: true }]]),
      NOW_MS,
    )
    expect(payload.modal).toBeNull()
  })

  it('shows the item again once a re-announce bumps its epoch', () => {
    const item = makeAnnouncement({ reannounceEpoch: 2 })
    const payload = evaluateForUser(
      [item],
      OWNER_FREE,
      states([[item.id, { epoch: 1, seen: true, dismissed: true }]]),
      NOW_MS,
    )
    expect(payload.modal?.id).toBe(item.id)
    expect(payload.changelog.unreadCount).toBe(1)
  })

  it('keeps a dismissed item in the changelog as read', () => {
    const item = makeAnnouncement()
    const payload = evaluateForUser(
      [item],
      OWNER_FREE,
      states([[item.id, { epoch: 1, seen: true, dismissed: true }]]),
      NOW_MS,
    )
    expect(payload.changelog.items).toHaveLength(1)
    expect(payload.changelog.items[0].unread).toBe(false)
    expect(payload.changelog.unreadCount).toBe(0)
  })

  it('omits items that are scheduled out or not targeted', () => {
    const future = makeAnnouncement({ startsAtMs: NOW_MS + 1 })
    const expired = makeAnnouncement({ endsAtMs: NOW_MS })
    const otherPlan = makeAnnouncement({
      targetPlans: [AnnouncementPlanTarget.PRO],
    })
    const payload = evaluateForUser(
      [future, expired, otherPlan],
      OWNER_FREE,
      states(),
      NOW_MS,
    )
    expect(payload.modal).toBeNull()
    expect(payload.changelog.items).toEqual([])
  })

  it('excludes items opted out of the changelog and caps the boot list', () => {
    const hidden = makeAnnouncement({ inChangelog: false })
    const many = Array.from({ length: CHANGELOG_BOOT_LIMIT + 5 }, () =>
      makeAnnouncement({ placement: AnnouncementPlacement.CHANGELOG }),
    )
    const payload = evaluateForUser(
      [hidden, ...many],
      OWNER_FREE,
      states(),
      NOW_MS,
    )
    expect(payload.changelog.items).toHaveLength(CHANGELOG_BOOT_LIMIT)
    expect(payload.changelog.unreadCount).toBe(many.length)
    expect(
      payload.changelog.items.find((item) => item.id === hidden.id),
    ).toBeUndefined()
  })

  it('sorts the changelog newest first', () => {
    const older = makeAnnouncement({ publishedAtMs: NOW_MS - 5_000 })
    const newer = makeAnnouncement({ publishedAtMs: NOW_MS - 1_000 })
    const items = buildChangelog(
      eligibleFor([older, newer], OWNER_FREE, NOW_MS),
      states(),
    )
    expect(items.map((item) => item.id)).toEqual([newer.id, older.id])
  })

  it('evaluates a full active list well inside the 5 ms budget', () => {
    const active = Array.from({ length: 200 }, (_, index) =>
      makeAnnouncement({ priority: index % 7 }),
    )
    const startedAt = process.hrtime.bigint()
    evaluateForUser(active, OWNER_FREE, states(), NOW_MS)
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6
    expect(elapsedMs).toBeLessThan(5)
  })
})
