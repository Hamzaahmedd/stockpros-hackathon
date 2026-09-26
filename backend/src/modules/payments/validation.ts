import { z } from 'zod'

// Only PRO is purchasable today — FREE is never checked out for, it's the
// default/downgrade tier handled entirely by the Bypass Mode /auth/plan route.
export const createCheckoutValidator = z.object({
  plan: z.literal('PRO', {
    required_error: 'Plan is required',
    invalid_type_error: 'Plan must be PRO',
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
