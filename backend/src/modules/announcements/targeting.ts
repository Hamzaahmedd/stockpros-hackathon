import { AnnouncementPlacement, AnnouncementPlanTarget } from '@prisma/client'
import { CHANGELOG_BOOT_LIMIT } from './constants'
import type {
  ActiveAnnouncement,
  AnnouncementBootPayload,
  AnnouncementDto,
  AudienceContext,
  UserAnnouncementState,
  UserStateMap,
} from './types'

/** The recorded state only counts while it belongs to the announcement's current re-announce epoch. */
const currentState = (
  item: ActiveAnnouncement,
  states: UserStateMap,
): UserAnnouncementState | null => {
  const state = states.get(item.id)
  return state?.epoch === item.reannounceEpoch ? state : null
}

export const isInWindow = (item: ActiveAnnouncement, nowMs: number): boolean =>
  (item.startsAtMs === null || nowMs >= item.startsAtMs) &&
  (item.endsAtMs === null || nowMs < item.endsAtMs)

export const matchesAudience = (
  item: ActiveAnnouncement,
  audience: AudienceContext,
): boolean => {
  const planMatch =
    item.targetPlans.includes(AnnouncementPlanTarget.ALL) ||
    item.targetPlans.some((target) => target === audience.plan)
  const roleMatch =
    item.targetRoles.length === 0 || item.targetRoles.includes(audience.role)
  return planMatch && roleMatch
}

const toDto = (item: ActiveAnnouncement, unread: boolean): AnnouncementDto => ({
  id: item.id,
  title: item.title,
  body: item.body,
  ctaLabel: item.ctaLabel,
  ctaUrl: item.ctaUrl,
  imageUrl: item.imageUrl,
  placement: item.placement,
  severity: item.severity,
  anchor: item.anchor,
  navKey: item.navKey,
  priority: item.priority,
  dismissible: item.dismissible,
  publishedAt: new Date(item.publishedAtMs).toISOString(),
  unread,
})

/** Highest priority first; newest first on ties; id as the final tiebreak so the order is stable. */
const byPriority = (a: ActiveAnnouncement, b: ActiveAnnouncement): number =>
  b.priority - a.priority ||
  b.publishedAtMs - a.publishedAtMs ||
  a.id.localeCompare(b.id)

const byRecency = (a: ActiveAnnouncement, b: ActiveAnnouncement): number =>
  b.publishedAtMs - a.publishedAtMs || a.id.localeCompare(b.id)

/** Everything this viewer may currently be shown, before dismissal or placement rules. */
export const eligibleFor = (
  active: readonly ActiveAnnouncement[],
  audience: AudienceContext,
  nowMs: number,
): ActiveAnnouncement[] =>
  active.filter(
    (item) => isInWindow(item, nowMs) && matchesAudience(item, audience),
  )

/**
 * The changelog is history, not an interruption: dismissing a popup does not
 * remove it from the drawer, it only marks it read.
 */
export const buildChangelog = (
  eligible: readonly ActiveAnnouncement[],
  states: UserStateMap,
): AnnouncementDto[] =>
  eligible
    .filter((item) => item.inChangelog)
    .sort(byRecency)
    .map((item) => {
      const state = currentState(item, states)
      return toDto(item, !(state?.seen || state?.dismissed))
    })

/** Pure targeting + dismissal + placement selection. No I/O, so it stays well under the 5 ms budget. */
export const evaluateForUser = (
  active: readonly ActiveAnnouncement[],
  audience: AudienceContext,
  states: UserStateMap,
  nowMs: number,
): AnnouncementBootPayload => {
  const eligible = eligibleFor(active, audience, nowMs)

  const interruptions = eligible
    .filter((item) => !currentState(item, states)?.dismissed)
    .sort(byPriority)
  const first = (placement: AnnouncementPlacement): AnnouncementDto | null => {
    const item = interruptions.find(
      (candidate) => candidate.placement === placement,
    )
    return item ? toDto(item, true) : null
  }

  const changelog = buildChangelog(eligible, states)

  return {
    modal: first(AnnouncementPlacement.MODAL),
    banner: first(AnnouncementPlacement.BANNER),
    spotlight: first(AnnouncementPlacement.SPOTLIGHT),
    badges: interruptions
      .filter((item) => item.placement === AnnouncementPlacement.BADGE)
      .map((item) => toDto(item, true)),
    changelog: {
      items: changelog.slice(0, CHANGELOG_BOOT_LIMIT),
      unreadCount: changelog.filter((item) => item.unread).length,
    },
  }
}
