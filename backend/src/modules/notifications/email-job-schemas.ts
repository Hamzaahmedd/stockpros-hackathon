import { AlertType, TeamRole, UsageAlertKind } from '@prisma/client'
import { z } from 'zod'
import { RENEWAL_REMINDER_VARIANTS } from './email-templates/subscription-renewal'
import { JOIN_REQUEST_EMAIL_KINDS } from './email-templates/team-join-request'

// Job payloads round-trip through Redis, so what a worker reads is not
// guaranteed to be what the producer wrote (stale jobs from an older deploy,
// manual edits, corruption). These schemas are the single source of truth: the
// payload types are inferred from them and workers parse with them, instead of
// casting `job.data`.
const id = z.string().min(1)
const recipient = z.string().email()

// These links are placed in email `href`s, so only web URLs are acceptable —
// zod's plain .url() also accepts schemes such as javascript: and data:.
const webUrl = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), {
    message: 'Must be an http(s) URL',
  })

export const alertEmailJobSchema = z.object({
  to: recipient,
  /** Whose alert this is — the log correlation id (never the address). */
  userId: id,
  symbol: id,
  alertType: z.nativeEnum(AlertType),
  title: z.string(),
  body: z.string(),
})

export const authEmailJobSchema = z.object({
  to: recipient,
  loginLink: webUrl,
  expiryMinutes: z.number().positive(),
})

export const renewalReminderJobSchema = z.object({
  to: recipient,
  /** Log correlation id; a team subscription has no single user, so this is the subscription. */
  subscriptionId: id,
  userName: z.string(),
  amount: z.string(),
  renewsOn: z.string(),
  manageUrl: webUrl,
  variant: z.enum(RENEWAL_REMINDER_VARIANTS),
})

export const teamInviteJobSchema = z.object({
  to: recipient,
  inviteId: id,
  teamId: id,
  inviterName: z.string(),
  teamName: z.string(),
  inviteUrl: webUrl,
  role: z.nativeEnum(TeamRole),
  /** ISO 8601 — jobs are JSON-serialised, so no Date objects. */
  expiresAt: z.string().datetime(),
})

export const teamJoinRequestJobSchema = z.object({
  to: recipient,
  /** Log correlation id: the request, never the address. */
  requestId: id,
  teamId: id,
  kind: z.enum(JOIN_REQUEST_EMAIL_KINDS),
  teamName: z.string(),
  requesterName: z.string(),
  actionUrl: webUrl,
})

export const paymentReceiptJobSchema = z.object({
  to: recipient,
  /** Log correlation id — never the address. */
  transactionId: id,
  teamId: id,
  teamName: z.string(),
  referenceNumber: z.string(),
  description: z.string(),
  amount: z.string(),
  seatCount: z.number().int().positive(),
  paidOn: z.string(),
  manageUrl: webUrl,
})

export const usageAlertJobSchema = z.object({
  to: recipient,
  /** Log correlation id — never the address. */
  userId: id,
  kind: z.nativeEnum(UsageAlertKind),
  userName: z.string(),
  usedSignals: z.number().int().nonnegative(),
  includedSignals: z.number().int().positive(),
  resetsOn: z.string(),
  creditBalance: z.string(),
  spendLimit: z.string().optional(),
  spentSoFar: z.string().optional(),
  usageUrl: webUrl,
})

export const spendLimitChangedJobSchema = z.object({
  to: recipient,
  /** Log correlation id — never the address. */
  userId: id,
  userName: z.string(),
  previousLimit: z.string(),
  newLimit: z.string(),
  ticketRef: z.string().min(1),
  usageUrl: webUrl,
})

export const staffStepUpJobSchema = z.object({
  to: recipient,
  /** Log correlation id (the staff user) — never the address or the code. */
  userId: id,
  code: z.string().regex(/^\d{6}$/),
  expiryMinutes: z.number().positive(),
})

export const adminActionAlertJobSchema = z.object({
  to: recipient,
  action: id,
  adminId: id,
  targetType: id,
  targetId: id,
  ticketRef: z.string().optional(),
  /** ISO 8601 — jobs are JSON-serialised, so no Date objects. */
  at: z.string().datetime(),
})

export type EmailJobPayload = z.infer<typeof alertEmailJobSchema>
export type AuthEmailJobPayload = z.infer<typeof authEmailJobSchema>
export type RenewalReminderEmailJobPayload = z.infer<
  typeof renewalReminderJobSchema
>
export type TeamInviteEmailJobPayload = z.infer<typeof teamInviteJobSchema>
export type TeamJoinRequestEmailJobPayload = z.infer<
  typeof teamJoinRequestJobSchema
>
export type UsageAlertEmailJobPayload = z.infer<typeof usageAlertJobSchema>
export type SpendLimitChangedEmailJobPayload = z.infer<
  typeof spendLimitChangedJobSchema
>
export type StaffStepUpEmailJobPayload = z.infer<typeof staffStepUpJobSchema>
export type AdminActionAlertEmailJobPayload = z.infer<
  typeof adminActionAlertJobSchema
>
export type PaymentReceiptEmailJobPayload = z.infer<
  typeof paymentReceiptJobSchema
>
