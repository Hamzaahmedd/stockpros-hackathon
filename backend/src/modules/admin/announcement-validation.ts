import {
  AnnouncementAnchor,
  AnnouncementNavKey,
  AnnouncementPlacement,
  AnnouncementPlanTarget,
  AnnouncementSeverity,
  AnnouncementStatus,
  TeamRole,
} from '@prisma/client'
import { z } from 'zod'
import config from '@/config'
import {
  ADMIN_DEFAULT_PAGE_SIZE,
  ADMIN_MAX_PAGE_SIZE,
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_CTA_LABEL_MAX,
  ANNOUNCEMENT_PRIORITY_MAX,
  ANNOUNCEMENT_PRIORITY_MIN,
  ANNOUNCEMENT_TITLE_MAX,
  ANNOUNCEMENT_URL_MAX,
} from './constants'
import { reasonSchema, ticketRefSchema } from './validation'

/** An in-app path ("/plans") or an https URL without credentials. Never "//host", "javascript:" or "data:". */
export const isSafeCtaUrl = (value: string): boolean => {
  if (value.startsWith('/')) return /^\/(?![/\\])[^\s\\]*$/.test(value)
  return isHttpsUrl(value)
}

const isHttpsUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

const blankToNull = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value

const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional())

const dateField = z.preprocess(
  blankToNull,
  z.string().datetime({ offset: true }).nullable().optional(),
)

const dedupe = <T>(values: readonly T[]): T[] => [...new Set(values)]

/** "ALL" already covers every plan, so it absorbs any other entry. */
const normalizePlans = (
  plans: AnnouncementPlanTarget[],
): AnnouncementPlanTarget[] =>
  plans.includes(AnnouncementPlanTarget.ALL)
    ? [AnnouncementPlanTarget.ALL]
    : dedupe(plans)

/** The authored fields of an announcement, before cross-field rules. */
export const announcementContentShape = {
  title: z
    .string()
    .trim()
    .min(1, 'title is required')
    .max(ANNOUNCEMENT_TITLE_MAX),
  body: z.string().trim().min(1, 'body is required').max(ANNOUNCEMENT_BODY_MAX),
  ctaLabel: optionalText(ANNOUNCEMENT_CTA_LABEL_MAX),
  ctaUrl: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .max(ANNOUNCEMENT_URL_MAX)
      .refine(isSafeCtaUrl, 'ctaUrl must be an in-app path or an https URL')
      .nullable()
      .optional(),
  ),
  imageUrl: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .max(ANNOUNCEMENT_URL_MAX)
      .refine(isHttpsUrl, 'imageUrl must be an https URL')
      .nullable()
      .optional(),
  ),
  placement: z.nativeEnum(AnnouncementPlacement),
  severity: z.nativeEnum(AnnouncementSeverity).nullable().optional(),
  anchor: z.nativeEnum(AnnouncementAnchor).nullable().optional(),
  navKey: z.nativeEnum(AnnouncementNavKey).nullable().optional(),
  priority: z
    .number()
    .int()
    .min(ANNOUNCEMENT_PRIORITY_MIN)
    .max(ANNOUNCEMENT_PRIORITY_MAX)
    .default(0),
  dismissible: z.boolean().default(true),
  inChangelog: z.boolean().default(true),
  targetPlans: z
    .array(z.nativeEnum(AnnouncementPlanTarget))
    .min(1, 'targetPlans needs at least one entry (ALL targets everyone)')
    .transform(normalizePlans)
    .default([AnnouncementPlanTarget.ALL]),
  targetRoles: z
    .array(z.nativeEnum(TeamRole))
    .transform((roles) => dedupe(roles))
    .default([]),
  startsAt: dateField,
  endsAt: dateField,
}

type ContentRuleInput = {
  placement?: AnnouncementPlacement
  dismissible?: boolean
  severity?: AnnouncementSeverity | null
  anchor?: AnnouncementAnchor | null
  navKey?: AnnouncementNavKey | null
  inChangelog?: boolean
  ctaLabel?: string | null
  ctaUrl?: string | null
  startsAt?: string | null
  endsAt?: string | null
}

const issue = (ctx: z.RefinementCtx, path: string, message: string): void =>
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })

/** Placements that block or cover the UI, so a user must always be able to close them. */
const INTERRUPTIVE_PLACEMENTS: ReadonlySet<AnnouncementPlacement | undefined> =
  new Set([AnnouncementPlacement.MODAL, AnnouncementPlacement.SPOTLIGHT])

/** Rules that tie fields together; run on the full, merged announcement. */
export const refineAnnouncementContent = (
  data: ContentRuleInput,
  ctx: z.RefinementCtx,
): void => {
  const { placement } = data
  if (placement === AnnouncementPlacement.SPOTLIGHT && !data.anchor) {
    issue(ctx, 'anchor', 'anchor is required for a SPOTLIGHT')
  }
  if (placement !== AnnouncementPlacement.SPOTLIGHT && data.anchor) {
    issue(ctx, 'anchor', 'anchor only applies to a SPOTLIGHT')
  }
  if (placement === AnnouncementPlacement.BADGE && !data.navKey) {
    issue(ctx, 'navKey', 'navKey is required for a BADGE')
  }
  if (placement !== AnnouncementPlacement.BADGE && data.navKey) {
    issue(ctx, 'navKey', 'navKey only applies to a BADGE')
  }
  if (placement === AnnouncementPlacement.BANNER && !data.severity) {
    issue(ctx, 'severity', 'severity is required for a BANNER')
  }
  if (placement !== AnnouncementPlacement.BANNER && data.severity) {
    issue(ctx, 'severity', 'severity only applies to a BANNER')
  }
  if (placement === AnnouncementPlacement.CHANGELOG && !data.inChangelog) {
    issue(
      ctx,
      'inChangelog',
      'a CHANGELOG announcement must be listed in the changelog',
    )
  }
  if (INTERRUPTIVE_PLACEMENTS.has(placement) && data.dismissible === false) {
    issue(ctx, 'dismissible', 'a MODAL or SPOTLIGHT must be dismissible')
  }
  if (Boolean(data.ctaLabel) !== Boolean(data.ctaUrl)) {
    issue(ctx, 'ctaUrl', 'ctaLabel and ctaUrl must be provided together')
  }
  if (
    data.startsAt &&
    data.endsAt &&
    Date.parse(data.endsAt) <= Date.parse(data.startsAt)
  ) {
    issue(ctx, 'endsAt', 'endsAt must be after startsAt')
  }
}

const writeFields = { reason: reasonSchema, ticketRef: ticketRefSchema }

const requireTicketWhenConfigured = (
  data: { ticketRef?: string },
  ctx: z.RefinementCtx,
): void => {
  if (config.admin.requireTicketRef && !data.ticketRef) {
    issue(ctx, 'ticketRef', 'ticketRef is required')
  }
}

/** The complete, merged announcement content. Used for create and after applying an edit. */
export const announcementContentValidator = z
  .object(announcementContentShape)
  .superRefine(refineAnnouncementContent)

export const createAnnouncementValidator = z
  .object({ ...announcementContentShape, ...writeFields })
  .superRefine(refineAnnouncementContent)
  .superRefine(requireTicketWhenConfigured)

/** Any subset of the content, plus the version the editor last saw (optimistic concurrency). */
export const updateAnnouncementValidator = z
  .object({
    ...z.object(announcementContentShape).partial().shape,
    expectedVersion: z
      .number({ required_error: 'expectedVersion is required' })
      .int()
      .min(1),
    ...writeFields,
  })
  .superRefine(requireTicketWhenConfigured)

export const announcementActionValidator = z
  .object(writeFields)
  .superRefine(requireTicketWhenConfigured)

export const announcementListQueryValidator = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_MAX_PAGE_SIZE)
    .default(ADMIN_DEFAULT_PAGE_SIZE),
  status: z.nativeEnum(AnnouncementStatus).optional(),
  placement: z.nativeEnum(AnnouncementPlacement).optional(),
})

export type CreateAnnouncementInput = z.infer<
  typeof createAnnouncementValidator
>
export type UpdateAnnouncementInput = z.infer<
  typeof updateAnnouncementValidator
>
export type AnnouncementContent = z.infer<typeof announcementContentValidator>
