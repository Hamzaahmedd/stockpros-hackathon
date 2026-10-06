import {
  DomainAuthPolicy,
  TeamAuditAction,
  TeamJoinPolicy,
} from '@prisma/client'
import { z } from 'zod'
import {
  seatCountValidator,
  TEAM_MAX_SEATS,
  teamNameValidator,
} from '../payments/public'
import { ChartLayout, PreferenceTheme } from './constants'

export const createTeamValidator = z.object({
  name: teamNameValidator,
  seatCount: seatCountValidator,
})

// Adding seats mid-term is additive, so the floor is 1 (not the 2-seat minimum
// that applies to a new workspace); the ceiling is re-checked against capacity.
export const addSeatsValidator = z.object({
  seatCount: z
    .number({ required_error: 'seatCount is required' })
    .int('seatCount must be a whole number')
    .min(1)
    .max(TEAM_MAX_SEATS),
})

export const createInviteValidator = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
})

export const acceptInviteValidator = z.object({
  token: z.string().min(1, 'Invite token is required'),
})

export const userIdParamValidator = z.object({
  userId: z.string().uuid('userId must be a valid id'),
})

export const idParamValidator = z.object({
  id: z.string().uuid('id must be a valid id'),
})

const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/

export const domainValidator = z
  .string({ required_error: 'domain is required' })
  .trim()
  .toLowerCase()
  .regex(DOMAIN_PATTERN, 'A valid domain such as fund.com is required')

export const addDomainValidator = z.object({
  domain: domainValidator,
  restrictOrgCreation: z.boolean().default(true),
})

export const verifyDomainValidator = z.object({ domain: domainValidator })

export const instructionsValidator = z.object({
  orgInstructions: z
    .string()
    .trim()
    .max(4000, 'Instructions must be at most 4000 characters')
    .nullable(),
})

export const creditLimitValidator = z.object({
  monthlyCreditLimitPaisa: z
    .number()
    .int('Limit must be a whole number of paisa')
    .min(0)
    .nullable(),
})

const preferenceFields = {
  theme: z.nativeEnum(PreferenceTheme),
  chartLayout: z.nativeEnum(ChartLayout),
  indicators: z.array(z.string().trim().min(1).max(40)).max(20),
}

/**
 * The stored shape (every field optional, absent = "use the default"), and the
 * defensive reader for it. Stored JSON can predate a schema change or have been
 * edited by hand, so each field is validated on its own: one that is missing or
 * no longer valid reads as unset and never discards the fields that are fine.
 */
export const storedPreferencesValidator = z.object({
  theme: preferenceFields.theme.optional().catch(undefined),
  chartLayout: preferenceFields.chartLayout.optional().catch(undefined),
  indicators: preferenceFields.indicators.optional().catch(undefined),
})

export type Preferences = z.infer<typeof storedPreferencesValidator>

/**
 * A PATCH body: a field to set, omitted to leave alone, or `null` to clear it
 * back to the default (the workspace default for personal preferences).
 */
export const preferencesValidator = z
  .object({
    theme: preferenceFields.theme.nullable(),
    chartLayout: preferenceFields.chartLayout.nullable(),
    indicators: preferenceFields.indicators.nullable(),
  })
  .partial()
  .strict()

export type PreferencesPatch = z.infer<typeof preferencesValidator>

const symbolValidator = z.string().trim().min(1).max(12).toUpperCase()

export const sharedWatchlistValidator = z.object({
  name: z.string().trim().min(1).max(80),
  symbols: z.array(symbolValidator).min(1).max(100),
})

// A screener's criteria are stored as JSON, so they are validated as JSON:
// strings, finite numbers, booleans, null, arrays and objects of those. This
// is what lets them be handed to Prisma without a cast.
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const jsonValueValidator: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueValidator),
    z.record(jsonValueValidator),
  ]),
)

export const sharedScreenerValidator = z.object({
  name: z.string().trim().min(1).max(80),
  criteria: z.record(jsonValueValidator),
})

export const researchNoteValidator = z.object({
  symbol: symbolValidator,
  content: z.string().trim().min(1).max(10_000),
})

export const notesQueryValidator = z.object({
  symbol: symbolValidator.optional(),
})

export const searchQueryValidator = z.object({
  q: z.string().trim().min(2, 'Query must be at least 2 characters').max(100),
})

export const changeRoleValidator = z.object({
  role: z.enum(['ADMIN', 'MEMBER']),
})

export const transferOwnershipValidator = z.object({
  userId: z.string().uuid('userId must be a valid id'),
})

export const renameTeamValidator = z.object({ name: teamNameValidator })

export const deleteTeamValidator = z.object({
  confirmName: z.string({ required_error: 'confirmName is required' }),
})

export const billingContactValidator = z.object({
  billingEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('A valid email is required')
    .max(254)
    .nullable(),
})

// A reduction must go below the current seats, so the floor is the 2-seat minimum.
export const reduceSeatsValidator = z.object({
  seatCount: z
    .number({ required_error: 'seatCount is required' })
    .int('seatCount must be a whole number')
    .min(2, 'A workspace needs at least 2 seats')
    .max(TEAM_MAX_SEATS),
})

export const auditLogQueryValidator = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid('cursor must be a valid id').optional(),
  action: z.nativeEnum(TeamAuditAction).optional(),
})

export type AuditLogQuery = z.infer<typeof auditLogQueryValidator>

export const joinRequestValidator = z.object({
  teamId: z.string().uuid('teamId must be a valid id'),
})

export const joinPolicyParamValidator = z.object({ domain: domainValidator })

export const joinPolicyValidator = z.object({
  joinPolicy: z.nativeEnum(TeamJoinPolicy),
})

export const authPolicyValidator = z.object({
  authPolicy: z.nativeEnum(DomainAuthPolicy),
  /** Required when moving to a stricter policy: the domain typed back by the owner. */
  confirmDomain: domainValidator.optional(),
})
