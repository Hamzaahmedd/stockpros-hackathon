import z from 'zod'

export const submitFeedbackValidator = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Feedback message is required')
    .max(2000, 'Feedback message must be 2000 characters or fewer'),
  page: z.string().trim().max(200).optional(),
})

export const getFeedbackQueryValidator = z.object({
  cursor: z.string().uuid('Invalid cursor').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
