import { AdminAuditAction, PaymentStatus, PlanTier } from '@prisma/client'
import { z } from 'zod'
import { TEAM_MIN_SEATS } from '../payments/public'
import {
  ADMIN_DEFAULT_PAGE_SIZE,
  ADMIN_MAX_CREDIT_ADJUSTMENT_PAISA,
  ADMIN_MAX_PAGE_SIZE,
  ADMIN_MAX_REASON_LENGTH,
  ADMIN_MIN_REASON_LENGTH,
  ADMIN_SEARCH_MIN_QUERY_LENGTH,
  ADMIN_TEAM_MAX_SEATS,
  AdminCreditTarget,
} from './constants'

/** Mandatory justification stored on the audit row of every write. */
export const reasonSchema = z
  .string({ required_error: 'reason is required' })
  .trim()
  .min(
    ADMIN_MIN_REASON_LENGTH,
    `reason must be at least ${ADMIN_MIN_REASON_LENGTH} characters`,
  )
  .max(ADMIN_MAX_REASON_LENGTH)

export const reasonBodyValidator = z.object({ reason: reasonSchema })

export const idParamValidator = z.object({
  id: z.string().uuid('id must be a valid id'),
})

export const userIdParamValidator = z.object({
  userId: z.string().uuid('userId must be a valid id'),
})

const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_MAX_PAGE_SIZE)
    .default(ADMIN_DEFAULT_PAGE_SIZE),
}

const searchTerm = z.string().trim().min(ADMIN_SEARCH_MIN_QUERY_LENGTH).max(100)

// ─── Users ───────────────────────────────────────────────────────────────────
export const searchQueryValidator = z.object({
  q: searchTerm,
  limit: pageQuery.limit,
})

export const planOverrideValidator = z.object({
  plan: z.nativeEnum(PlanTier),
  reason: reasonSchema,
})

// ─── Teams ───────────────────────────────────────────────────────────────────
export const capacityValidator = z.object({
  seatCapacity: z
    .number({ required_error: 'seatCapacity is required' })
    .int('seatCapacity must be a whole number')
    .min(TEAM_MIN_SEATS)
    .max(ADMIN_TEAM_MAX_SEATS),
  reason: reasonSchema,
})

// ─── Billing ─────────────────────────────────────────────────────────────────
export const webhookQueryValidator = z.object({
  ...pageQuery,
  status: z.nativeEnum(PaymentStatus).optional(),
  trackerId: z.string().trim().min(1).max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

export const creditAdjustmentValidator = z.object({
  target: z.nativeEnum(AdminCreditTarget),
  targetId: z.string().uuid('targetId must be a valid id'),
  amountPaisa: z
    .number({ required_error: 'amountPaisa is required' })
    .int('amountPaisa must be a whole number of paisa')
    .refine((value) => value !== 0, 'amountPaisa must not be zero')
    .refine(
      (value) => Math.abs(value) <= ADMIN_MAX_CREDIT_ADJUSTMENT_PAISA,
      `amountPaisa must be within ±${ADMIN_MAX_CREDIT_ADJUSTMENT_PAISA}`,
    ),
  reason: reasonSchema,
})

export const extendSubscriptionValidator = z
  .object({
    currentPeriodEnd: z.coerce.date().optional(),
    gracePeriodEnd: z.coerce.date().optional(),
    reason: reasonSchema,
  })
  .refine(
    (value) => value.currentPeriodEnd || value.gracePeriodEnd,
    'Provide currentPeriodEnd and/or gracePeriodEnd',
  )

// ─── Telemetry & system ──────────────────────────────────────────────────────
export const usageQueryValidator = z.object({
  ...pageQuery,
  userId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  symbol: z.string().trim().min(1).max(20).optional(),
  feature: z.string().trim().min(1).max(100).optional(),
})

export const marketEmergencyValidator = z.object({
  closed: z.boolean({ required_error: 'closed is required' }),
  reason: reasonSchema,
})

export const auditLogQueryValidator = z.object({
  ...pageQuery,
  adminId: z.string().uuid().optional(),
  action: z.nativeEnum(AdminAuditAction).optional(),
  targetType: z.string().trim().min(1).max(50).optional(),
  targetId: z.string().trim().min(1).max(100).optional(),
})
