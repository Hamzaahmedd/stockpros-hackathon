import { z } from 'zod'

// Only PRO is purchasable today — FREE is never checked out for, it's the
// default/downgrade tier handled entirely by the Bypass Mode /auth/plan route.
export const createCheckoutValidator = z.object({
  plan: z.literal('PRO', {
    required_error: 'Plan is required',
    invalid_type_error: 'Plan must be PRO',
  }),
  paymentMethod: z.enum(['CARD', 'WALLET'], {
    required_error: 'Payment method is required',
    invalid_type_error: 'Payment method must be CARD or WALLET',
  }),
})

export const verifyTrackerValidator = z.object({
  trackerId: z
    .string({
      required_error: 'Tracker id is required',
      invalid_type_error: 'Tracker id must be a string',
    })
    .min(1, 'Tracker id is required'),
})

export const toggleAutoRenewValidator = z.object({
  enabled: z.boolean({
    required_error: 'enabled is required',
    invalid_type_error: 'enabled must be a boolean',
  }),
})
