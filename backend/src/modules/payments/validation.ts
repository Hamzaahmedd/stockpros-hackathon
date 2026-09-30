import { z } from 'zod'
import {
  CheckoutPlan,
  SubscriptionScope,
  TEAM_MAX_SEATS,
  TEAM_MIN_SEATS,
  TopupPackId,
} from './constants'

export const seatCountValidator = z
  .number({
    required_error: 'seatCount is required',
    invalid_type_error: 'seatCount must be a number',
  })
  .int('seatCount must be a whole number')
  .min(TEAM_MIN_SEATS)
  .max(TEAM_MAX_SEATS)

export const teamNameValidator = z
  .string({ required_error: 'Team name is required' })
  .trim()
  .min(2, 'Team name must be at least 2 characters')
  .max(80, 'Team name must be at most 80 characters')

const proCheckoutValidator = z.object({
  plan: z.literal(CheckoutPlan.PRO),
  paymentMethod: z.enum(['CARD', 'WALLET'], {
    required_error: 'Payment method is required',
    invalid_type_error: 'Payment method must be CARD or WALLET',
  }),
})

const teamCheckoutValidator = z.object({
  plan: z.literal(CheckoutPlan.TEAM),
  seatCount: seatCountValidator,
  teamName: teamNameValidator,
})

const topupCheckoutValidator = z.object({
  plan: z.literal(CheckoutPlan.TOPUP),
  packId: z.nativeEnum(TopupPackId, {
    required_error: 'packId is required',
    invalid_type_error: 'packId must be a valid top-up pack',
  }),
})

// FREE is never checked out for — it's the default/downgrade tier handled by
// the Bypass Mode /auth/plan route. PRO, TEAM and TOPUP are the purchasable
// products; prices are always derived server-side, never read from the body.
export const createCheckoutValidator = z.discriminatedUnion(
  'plan',
  [proCheckoutValidator, teamCheckoutValidator, topupCheckoutValidator],
  { errorMap: () => ({ message: 'plan must be PRO, TEAM or TOPUP' }) },
)

export const verifyTrackerValidator = z.object({
  trackerId: z
    .string({
      required_error: 'Tracker id is required',
      invalid_type_error: 'Tracker id must be a string',
    })
    .min(1, 'Tracker id is required'),
})

export const subscriptionScopeValidator = z
  .nativeEnum(SubscriptionScope)
  .default(SubscriptionScope.USER)

export const toggleAutoRenewValidator = z.object({
  scope: subscriptionScopeValidator,
  enabled: z.boolean({
    required_error: 'enabled is required',
    invalid_type_error: 'enabled must be a boolean',
  }),
})

export const subscriptionScopeQueryValidator = z.object({
  scope: subscriptionScopeValidator,
})

export const creditLedgerQueryValidator = z.object({
  scope: subscriptionScopeValidator,
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid('cursor must be a valid id').optional(),
})
