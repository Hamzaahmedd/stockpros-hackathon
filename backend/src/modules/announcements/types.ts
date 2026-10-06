import type {
  AnnouncementAnchor,
  AnnouncementNavKey,
  AnnouncementPlacement,
  AnnouncementPlanTarget,
  AnnouncementSeverity,
  PlanTier,
  TeamRole,
} from '@prisma/client'

/** A published, enabled announcement as held in the shared cache (JSON-safe: dates are epoch ms). */
export interface ActiveAnnouncement {
  id: string
  title: string
  body: string
  ctaLabel: string | null
  ctaUrl: string | null
  imageUrl: string | null
  placement: AnnouncementPlacement
  severity: AnnouncementSeverity | null
  anchor: AnnouncementAnchor | null
  navKey: AnnouncementNavKey | null
  priority: number
  dismissible: boolean
  inChangelog: boolean
  targetPlans: AnnouncementPlanTarget[]
  targetRoles: TeamRole[]
  startsAtMs: number | null
  endsAtMs: number | null
  publishedAtMs: number
  reannounceEpoch: number
}

/** What the viewer is, for audience targeting. Solo accounts are OWNER of their own account. */
export interface AudienceContext {
  plan: PlanTier
  role: TeamRole
}

/** One user's recorded interaction with an announcement. */
export interface UserAnnouncementState {
  epoch: number
  seen: boolean
  dismissed: boolean
}

export type UserStateMap = ReadonlyMap<string, UserAnnouncementState>

/** Client-facing announcement. */
export interface AnnouncementDto {
  id: string
  title: string
  body: string
  ctaLabel: string | null
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

export interface ChangelogDto {
  items: AnnouncementDto[]
  unreadCount: number
}

/** The announcements slice of the app-boot payload. */
export interface AnnouncementBootPayload {
  modal: AnnouncementDto | null
  banner: AnnouncementDto | null
  spotlight: AnnouncementDto | null
  badges: AnnouncementDto[]
  changelog: ChangelogDto
}
