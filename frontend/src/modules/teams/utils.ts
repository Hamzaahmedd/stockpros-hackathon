import { DomainAuthPolicy } from '@/modules/auth/types'
import {
  TeamJoinPolicy,
  type ChartLayout,
  type InvitableRole,
  type JoinOption,
  type PreferenceTheme,
  type TeamRole,
} from './types'

/** Owners and admins manage the workspace; plain members get read access. */
export const isTeamAdmin = (role: TeamRole): boolean =>
  role === 'OWNER' || role === 'ADMIN'

/**
 * What a role may do in the UI — mirrors the backend permission table
 * (shared/infrastructure/team-access.ts). The UI only hides controls; the
 * server enforces every one of these.
 */
export enum TeamAction {
  MANAGE = 'MANAGE', // members, credits, billing, settings, audit log
  CHANGE_ROLES = 'CHANGE_ROLES',
  TRANSFER_OWNERSHIP = 'TRANSFER_OWNERSHIP',
  DELETE_TEAM = 'DELETE_TEAM',
  EXPORT_TEAM = 'EXPORT_TEAM',
  SET_AUTH_POLICY = 'SET_AUTH_POLICY',
}

const OWNER_ONLY_ACTIONS: ReadonlySet<TeamAction> = new Set([
  TeamAction.CHANGE_ROLES,
  TeamAction.TRANSFER_OWNERSHIP,
  TeamAction.DELETE_TEAM,
  TeamAction.EXPORT_TEAM,
  TeamAction.SET_AUTH_POLICY,
])

export const canDo = (role: TeamRole, action: TeamAction): boolean =>
  OWNER_ONLY_ACTIONS.has(action) ? role === 'OWNER' : role !== 'MEMBER'

export { apiErrorMessage } from '@/shared/utils/api-error'

export const PREFERENCE_THEMES: readonly PreferenceTheme[] = [
  'LIGHT',
  'DARK',
  'SYSTEM',
]
export const CHART_LAYOUTS: readonly ChartLayout[] = ['SINGLE', 'SPLIT', 'GRID']
export const INVITABLE_ROLES: readonly InvitableRole[] = ['MEMBER', 'ADMIN']

// A <select>'s value is just a string; these turn it back into the typed value
// by looking it up in the allowed list, so nothing has to be cast (and an
// unexpected value can never slip through).
export const parsePreferenceTheme = (value: string): PreferenceTheme | '' =>
  PREFERENCE_THEMES.find((theme) => theme === value) ?? ''

export const parseChartLayout = (value: string): ChartLayout | '' =>
  CHART_LAYOUTS.find((layout) => layout === value) ?? ''

export const parseInvitableRole = (value: string): InvitableRole | undefined =>
  INVITABLE_ROLES.find((role) => role === value)

export const JOIN_POLICY_LABELS: Record<TeamJoinPolicy, string> = {
  [TeamJoinPolicy.INVITE_ONLY]: 'Invite only',
  [TeamJoinPolicy.REQUEST_APPROVAL]: 'Require admin approval',
  [TeamJoinPolicy.AUTO_APPROVE]: 'Auto-approve',
}

export const JOIN_POLICIES: readonly TeamJoinPolicy[] =
  Object.values(TeamJoinPolicy)

export const parseJoinPolicy = (value: string): TeamJoinPolicy | undefined =>
  JOIN_POLICIES.find((policy) => policy === value)

export const AUTH_POLICY_LABELS: Record<DomainAuthPolicy, string> = {
  [DomainAuthPolicy.ANY]: 'Any method',
  [DomainAuthPolicy.GOOGLE_ONLY]: 'Google sign-in only',
  [DomainAuthPolicy.GOOGLE_WORKSPACE]: 'Google Workspace only',
  [DomainAuthPolicy.SAML_SSO]: 'Single sign-on (SAML) only',
}

export const AUTH_POLICIES: readonly DomainAuthPolicy[] =
  Object.values(DomainAuthPolicy)

/** Anything other than "any method" locks members out of magic-link login, so it needs a typed confirmation. */
export const isStricterAuthPolicy = (policy: DomainAuthPolicy): boolean =>
  policy !== DomainAuthPolicy.ANY

/** The owner confirms a lockout-risk change by typing the domain exactly (case-insensitive, surrounding spaces ignored). */
export const isDomainConfirmation = (typed: string, domain: string): boolean =>
  typed.trim().toLowerCase() === domain.toLowerCase()

/** Confirmation message after a policy change, including how many sessions were signed out. */
export const authPolicyChangedMessage = (
  domain: string,
  policy: DomainAuthPolicy,
  revokedSessions: number,
): string =>
  `${domain}: ${AUTH_POLICY_LABELS[policy]}. ${revokedSessions} ${revokedSessions === 1 ? 'session was' : 'sessions were'} signed out.`

/** Button copy for a join option: auto-approve joins at once, otherwise it asks an admin. */
export const joinActionLabel = (option: JoinOption): string =>
  option.joinPolicy === TeamJoinPolicy.AUTO_APPROVE
    ? `Join ${option.teamName}`
    : `Request to join ${option.teamName}`

export const formatDate = (value: string | null): string =>
  value
    ? new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—'

/** Human label for a usage feature key returned by the analytics endpoint. */
export const FEATURE_LABELS: Record<string, string> = {
  ai_forecast: 'AI forecasts',
  ai_decision: 'Decision support',
  search: 'Searches',
}

export const featureLabel = (feature: string): string =>
  FEATURE_LABELS[feature] ?? feature

const MAX_INDICATORS = 20
const MAX_INDICATOR_LENGTH = 40

/**
 * Parses a comma-separated indicator list (blank entries dropped, duplicates
 * removed case-insensitively). Returns `null` when it breaks the backend's
 * limits (max 20 names, each 1–40 characters) so the UI can say so up front.
 */
export const parseIndicators = (input: string): string[] | null => {
  const seen = new Set<string>()
  const list: string[] = []
  for (const raw of input.split(',')) {
    const name = raw.trim()
    if (!name || seen.has(name.toLowerCase())) continue
    if (name.length > MAX_INDICATOR_LENGTH) return null
    seen.add(name.toLowerCase())
    list.push(name)
  }
  return list.length > MAX_INDICATORS ? null : list
}

/** Maps a stored preference onto the app's two-value theme (SYSTEM follows the OS). */
export const toAppTheme = (theme: PreferenceTheme): 'light' | 'dark' => {
  if (theme === 'LIGHT') return 'light'
  if (theme === 'DARK') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/** Readable labels for the audit log's action codes. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  MEMBER_INVITED: 'Invited a member',
  INVITE_REVOKED: 'Revoked an invite',
  INVITE_RESENT: 'Resent an invite',
  INVITE_ACCEPTED: 'Accepted an invite',
  MEMBER_REMOVED: 'Removed a member',
  MEMBER_LEFT: 'Left the workspace',
  ROLE_CHANGED: 'Changed a role',
  OWNERSHIP_TRANSFERRED: 'Transferred ownership',
  SETTINGS_UPDATED: 'Updated settings',
  DOMAIN_ADDED: 'Added a domain',
  DOMAIN_VERIFIED: 'Verified a domain',
  SEATS_ADDED: 'Added seats',
  SEAT_REDUCTION_SCHEDULED: 'Scheduled a seat reduction',
  SEAT_REDUCTION_CANCELLED: 'Cancelled the seat reduction',
  CREDIT_LIMIT_SET: 'Changed a credit limit',
  BILLING_CONTACT_UPDATED: 'Updated the billing contact',
  TEAM_RENAMED: 'Renamed the workspace',
  TEAM_DELETED: 'Deleted the workspace',
  TEAM_EXPORTED: 'Exported the workspace',
  SUBSCRIPTION_EXPIRED: 'Subscription expired',
}

export const auditActionLabel = (action: string): string =>
  AUDIT_ACTION_LABELS[action] ?? action

/** Saves a Blob as a file through a temporary link. */
export const saveBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
