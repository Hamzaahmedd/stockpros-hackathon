import type {
  DomainAuthPolicy,
  PlanTier,
  PlatformRole,
} from '@/modules/auth/types'
import type {
  AnnouncementAnchor,
  AnnouncementNavKey,
  AnnouncementPlacement,
  AnnouncementPlanTarget,
  AnnouncementSeverity,
  AnnouncementStatus,
  AnnouncementTeamRole,
} from '@/modules/announcements'
import type { UsageSummary } from '@/modules/plans/types'
import type {
  ADMIN_AUDIT_ACTIONS,
  BLOCKED_REASONS,
  CREDIT_LEDGER_TYPES,
  PAYMENT_STATUSES,
} from './constants'

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number]

export interface AdminPage<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

export interface AdminUser {
  id: string
  displayName: string | null
  email: string
  status: string
  plan: PlanTier
  platformRole: PlatformRole
  creditBalanceInPaisa: number
  /** The customer's own monthly credit-spend limit; null = none. */
  monthlyCreditLimitPaisa: number | null
  usageAlertsEnabled: boolean
  activeSessions: number
  deletedAt: string | null
  /** True when the API masked email/name; a Reveal (audited) shows the real values. */
  piiMasked: boolean
  subscription: {
    id: string
    planTier: PlanTier
    status: string
    autoRenew: boolean
    currentPeriodEnd: string | null
    gracePeriodEnd: string | null
  } | null
  team: { teamId: string; role: string } | null
}

/** One entry of a domain's SSO configuration trail (`SAML_*` team audit actions). */
export interface AdminSsoActivity {
  id: string
  action: string
  actorUserId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

/** A customer's SSO as staff see it (`GET /admin/teams/domains/:domain/sso`). */
export interface AdminTeamSso {
  domain: string
  domainId: string
  teamId: string
  authPolicy: DomainAuthPolicy
  enabled: boolean
  configured: boolean
  idpEntityId: string | null
  idpSsoUrl: string | null
  certificateExpiresAt: string | null
  testedAt: string | null
  lastLoginAt: string | null
  updatedByUserId: string | null
  activeSsoSessions: number
  recentActivity: AdminSsoActivity[]
}

export interface AdminTeam {
  id: string
  name: string
  status: string
  seatCapacity: number
  scheduledSeatCapacity: number | null
  effectiveSeatCapacity: number
  seatsUsed: number
  seatUtilization: string
  piiMasked: boolean
  orgInstructions: string | null
  creditBalanceInPaisa: number
  owner: { id: string; displayName: string | null; email: string }
  domains: {
    id: string
    domain: string
    isVerified: boolean
    authPolicy: DomainAuthPolicy
    samlEnabled: boolean
  }[]
  members: {
    role: string
    /** The workspace admin's cap for this member; null = none. */
    monthlyCreditLimitPaisa: number | null
    /** Credit drawn this billing cycle. */
    cycleSpendPaisa: number
    user: { id: string; displayName: string | null; email: string }
  }[]
  subscription: {
    id: string
    status: string
    currentPeriodEnd: string | null
  } | null
}

export interface AdminWebhook {
  id: string
  userId: string
  teamId: string | null
  trackerId: string
  status: PaymentStatus
  kind: string
  planTier: PlanTier
  amountPaisa: number
  paymentMethod: string | null
  webhookReceived: boolean
  signatureVerified: boolean
  payload: unknown
  createdAt: string
}

export type CreditLedgerType = (typeof CREDIT_LEDGER_TYPES)[number]

export interface CreditLedgerEntry {
  id: string
  userId: string | null
  teamId: string | null
  amountPaisa: number
  type: CreditLedgerType
  description: string
  createdAt: string
}

export type AdminQueueHealth =
  | { name: string; available: false }
  | {
      name: string
      available: true
      counts: Record<string, number>
      recentFailures: {
        id: string | null
        name: string
        attemptsMade: number
        failedReason: string
        failedAt: string | null
      }[]
    }

export interface TimelineEvent {
  id: string
  type: 'PAYMENT' | 'CREDIT' | 'SESSION' | 'TEAM' | 'STAFF_ACTION'
  title: string
  detail: string | null
  ticketRef: string | null
  at: string
}

export interface TimelinePage {
  items: TimelineEvent[]
  nextBefore: string | null
}

export interface RevealedUser {
  id: string
  email: string
  displayName: string | null
  phoneNumber: string | null
}

export interface AdminAuditEntry {
  id: string
  action: AdminAuditAction
  targetType: string
  targetId: string
  reason: string
  ticketRef: string | null
  ipAddress: string | null
  createdAt: string
  admin: { id: string; displayName: string | null }
}

export interface CreditLedgerFilters {
  userId?: string
  teamId?: string
  type?: CreditLedgerType
}

export interface WebhookFilters {
  status?: PaymentStatus
  trackerId?: string
}

export interface AuditFilters {
  action?: AdminAuditAction
  targetId?: string
  ticketRef?: string
}

/** Why the next metered AI action would be refused; mirrors the backend `OverageReason`. */
export type BlockedReason = (typeof BLOCKED_REASONS)[number]

/** `GET /admin/users/:id/usage`: the customer's own usage summary plus the refusal reason, if any. */
export type AdminUserUsage = UsageSummary & {
  userId: string
  blockedReason: BlockedReason | null
}

/** `GET /admin/announcements`: an announcement as staff see it, with its lifecycle state. */
export interface AdminAnnouncement {
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
  targetRoles: AnnouncementTeamRole[]
  startsAt: string | null
  endsAt: string | null
  publishedAt: string | null
  status: AnnouncementStatus
  /** The kill switch: false hides it everywhere without changing its status. */
  isEnabled: boolean
  /** Bumped on every write; sent back as `expectedVersion` so a stale edit is refused. */
  version: number
  /** Bumped by "re-announce"; earlier dismissals stop counting. */
  reannounceEpoch: number
  createdAt: string
  updatedAt: string
}

export interface AdminAnnouncementDetail extends AdminAnnouncement {
  engagement: { seen: number; dismissed: number }
}

export interface AnnouncementFilters {
  status?: AnnouncementStatus
  placement?: AnnouncementPlacement
}
