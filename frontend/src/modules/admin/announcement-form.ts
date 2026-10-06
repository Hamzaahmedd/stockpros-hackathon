import {
  AnnouncementPlacement,
  AnnouncementPlanTarget,
  AnnouncementTeamRole,
  type AnnouncementAnchor,
  type AnnouncementNavKey,
  type AnnouncementSeverity,
} from '@/modules/announcements'
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_CTA_LABEL_MAX,
  ANNOUNCEMENT_PRIORITY_MAX,
  ANNOUNCEMENT_PRIORITY_MIN,
  ANNOUNCEMENT_TITLE_MAX,
} from './constants'
import type { AdminAnnouncement } from './types'

/** The editor's working copy. Dates are `datetime-local` strings (local time); blanks mean "none". */
export interface AnnouncementDraft {
  title: string
  body: string
  placement: AnnouncementPlacement
  severity: AnnouncementSeverity | ''
  anchor: AnnouncementAnchor | ''
  navKey: AnnouncementNavKey | ''
  ctaLabel: string
  ctaUrl: string
  imageUrl: string
  priority: number
  dismissible: boolean
  inChangelog: boolean
  targetPlans: AnnouncementPlanTarget[]
  targetRoles: AnnouncementTeamRole[]
  startsAt: string
  endsAt: string
}

/** What the API accepts for create/update (everything except the audit fields). */
export interface AnnouncementPayload {
  title: string
  body: string
  placement: AnnouncementPlacement
  severity: AnnouncementSeverity | null
  anchor: AnnouncementAnchor | null
  navKey: AnnouncementNavKey | null
  ctaLabel: string | null
  ctaUrl: string | null
  imageUrl: string | null
  priority: number
  dismissible: boolean
  inChangelog: boolean
  targetPlans: AnnouncementPlanTarget[]
  targetRoles: AnnouncementTeamRole[]
  startsAt: string | null
  endsAt: string | null
}

export const EMPTY_DRAFT: AnnouncementDraft = {
  title: '',
  body: '',
  placement: AnnouncementPlacement.MODAL,
  severity: '',
  anchor: '',
  navKey: '',
  ctaLabel: '',
  ctaUrl: '',
  imageUrl: '',
  priority: 0,
  dismissible: true,
  inChangelog: true,
  targetPlans: [AnnouncementPlanTarget.ALL],
  targetRoles: [],
  startsAt: '',
  endsAt: '',
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** ISO instant -> the `YYYY-MM-DDTHH:mm` a datetime-local input shows, in the viewer's time zone. */
export const isoToLocalInput = (iso: string | null): string => {
  if (!iso) return ''
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** A datetime-local value (viewer's time zone) -> ISO instant. Blank is "no date". */
export const localInputToIso = (value: string): string | null => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export const toDraft = (
  announcement: AdminAnnouncement,
): AnnouncementDraft => ({
  title: announcement.title,
  body: announcement.body,
  placement: announcement.placement,
  severity: announcement.severity ?? '',
  anchor: announcement.anchor ?? '',
  navKey: announcement.navKey ?? '',
  ctaLabel: announcement.ctaLabel ?? '',
  ctaUrl: announcement.ctaUrl ?? '',
  imageUrl: announcement.imageUrl ?? '',
  priority: announcement.priority,
  dismissible: announcement.dismissible,
  inChangelog: announcement.inChangelog,
  targetPlans: announcement.targetPlans,
  targetRoles: announcement.targetRoles,
  startsAt: isoToLocalInput(announcement.startsAt),
  endsAt: isoToLocalInput(announcement.endsAt),
})

const blankToNull = (value: string): string | null => value.trim() || null

/** Sends only what the chosen placement uses, so switching placement never leaves stale fields behind. */
export const toPayload = (draft: AnnouncementDraft): AnnouncementPayload => ({
  title: draft.title.trim(),
  body: draft.body.trim(),
  placement: draft.placement,
  severity:
    draft.placement === AnnouncementPlacement.BANNER && draft.severity
      ? draft.severity
      : null,
  anchor:
    draft.placement === AnnouncementPlacement.SPOTLIGHT && draft.anchor
      ? draft.anchor
      : null,
  navKey:
    draft.placement === AnnouncementPlacement.BADGE && draft.navKey
      ? draft.navKey
      : null,
  ctaLabel: blankToNull(draft.ctaLabel),
  ctaUrl: blankToNull(draft.ctaUrl),
  imageUrl: blankToNull(draft.imageUrl),
  priority: draft.priority,
  dismissible: draft.dismissible,
  inChangelog: draft.inChangelog,
  targetPlans: draft.targetPlans,
  targetRoles: draft.targetRoles,
  startsAt: localInputToIso(draft.startsAt),
  endsAt: localInputToIso(draft.endsAt),
})

/** Placements the user must always be able to close. */
export const MUST_BE_DISMISSIBLE: readonly AnnouncementPlacement[] = [
  AnnouncementPlacement.MODAL,
  AnnouncementPlacement.SPOTLIGHT,
]

const isHttps = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

/** An in-app path or an https URL; the same rule the API applies. */
export const isSafeCtaUrl = (value: string): boolean =>
  value.startsWith('/') ? /^\/(?![/\\])[^\s\\]*$/.test(value) : isHttps(value)

/** Problems with a draft, in plain words. Empty means it can be submitted (the API still has the last word). */
export const validateDraft = (draft: AnnouncementDraft): string[] => {
  const problems: string[] = []
  const { placement } = draft

  if (!draft.title.trim()) problems.push('Title is required.')
  if (draft.title.trim().length > ANNOUNCEMENT_TITLE_MAX) {
    problems.push(`Title can be at most ${ANNOUNCEMENT_TITLE_MAX} characters.`)
  }
  if (!draft.body.trim()) problems.push('Body is required.')
  if (draft.body.trim().length > ANNOUNCEMENT_BODY_MAX) {
    problems.push(`Body can be at most ${ANNOUNCEMENT_BODY_MAX} characters.`)
  }
  if (placement === AnnouncementPlacement.BANNER && !draft.severity) {
    problems.push('Choose a severity for the banner.')
  }
  if (placement === AnnouncementPlacement.SPOTLIGHT && !draft.anchor) {
    problems.push('Choose what the spotlight points at.')
  }
  if (placement === AnnouncementPlacement.BADGE && !draft.navKey) {
    problems.push('Choose which menu entry gets the badge.')
  }
  if (MUST_BE_DISMISSIBLE.includes(placement) && !draft.dismissible) {
    problems.push('A modal or spotlight must be dismissible.')
  }
  if (placement === AnnouncementPlacement.CHANGELOG && !draft.inChangelog) {
    problems.push('A changelog entry must be listed in the changelog.')
  }

  const hasLabel = draft.ctaLabel.trim() !== ''
  const hasUrl = draft.ctaUrl.trim() !== ''
  if (hasLabel !== hasUrl) {
    problems.push('Give the button both a label and a link, or neither.')
  }
  if (draft.ctaLabel.trim().length > ANNOUNCEMENT_CTA_LABEL_MAX) {
    problems.push(
      `Button label can be at most ${ANNOUNCEMENT_CTA_LABEL_MAX} characters.`,
    )
  }
  if (hasUrl && !isSafeCtaUrl(draft.ctaUrl.trim())) {
    problems.push('The link must be an in-app path (/plans) or an https URL.')
  }
  if (draft.imageUrl.trim() && !isHttps(draft.imageUrl.trim())) {
    problems.push('The image must be an https URL.')
  }

  if (
    !Number.isInteger(draft.priority) ||
    draft.priority < ANNOUNCEMENT_PRIORITY_MIN ||
    draft.priority > ANNOUNCEMENT_PRIORITY_MAX
  ) {
    problems.push(
      `Priority must be a whole number from ${ANNOUNCEMENT_PRIORITY_MIN} to ${ANNOUNCEMENT_PRIORITY_MAX}.`,
    )
  }
  if (draft.targetPlans.length === 0) {
    problems.push('Pick at least one plan (or All plans).')
  }

  const starts = localInputToIso(draft.startsAt)
  const ends = localInputToIso(draft.endsAt)
  if (starts && ends && Date.parse(ends) <= Date.parse(starts)) {
    problems.push('The end must be after the start.')
  }
  return problems
}

/** Toggling "All plans" clears the others; picking a specific plan clears "All plans". */
export const togglePlan = (
  current: readonly AnnouncementPlanTarget[],
  plan: AnnouncementPlanTarget,
): AnnouncementPlanTarget[] => {
  if (plan === AnnouncementPlanTarget.ALL) return [AnnouncementPlanTarget.ALL]
  const specific = current.filter((item) => item !== AnnouncementPlanTarget.ALL)
  return specific.includes(plan)
    ? specific.filter((item) => item !== plan)
    : [...specific, plan]
}

export const toggleRole = (
  current: readonly AnnouncementTeamRole[],
  role: AnnouncementTeamRole,
): AnnouncementTeamRole[] =>
  current.includes(role)
    ? current.filter((item) => item !== role)
    : [...current, role]

/** One line saying who sees it. */
export const audienceSummary = (
  plans: readonly AnnouncementPlanTarget[],
  roles: readonly AnnouncementTeamRole[],
): string => {
  const planText = plans.includes(AnnouncementPlanTarget.ALL)
    ? 'All plans'
    : plans.join(', ')
  return roles.length === 0 ? planText : `${planText} · ${roles.join(', ')}`
}
