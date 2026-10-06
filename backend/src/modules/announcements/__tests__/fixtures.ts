import {
  AnnouncementPlacement,
  AnnouncementPlanTarget,
  TeamRole,
} from '@prisma/client'
import type { ActiveAnnouncement } from '../types'

export const NOW_MS = Date.UTC(2026, 9, 7, 12, 0, 0)
export const USER_ID = '0191e4a0-0000-7000-8000-0000000000aa'
export const OTHER_USER_ID = '0191e4a0-0000-7000-8000-0000000000bb'
export const ANNOUNCEMENT_ID = '0191e4a0-0000-7000-8000-0000000000cc'

let counter = 0

export const makeAnnouncement = (
  overrides: Partial<ActiveAnnouncement> = {},
): ActiveAnnouncement => {
  counter += 1
  return {
    id: `0191e4a0-0000-7000-8000-${String(counter).padStart(12, '0')}`,
    title: 'What is new',
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
    inChangelog: true,
    targetPlans: [AnnouncementPlanTarget.ALL],
    targetRoles: [],
    startsAtMs: null,
    endsAtMs: null,
    publishedAtMs: NOW_MS - 60_000,
    reannounceEpoch: 1,
    ...overrides,
  }
}

export const OWNER_FREE = { plan: 'FREE', role: TeamRole.OWNER } as const
