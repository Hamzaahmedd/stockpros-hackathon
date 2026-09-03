import { z } from 'zod'
import { MARKET_INTERESTS } from './preferences'

// ─── GET /notifications ───────────────────────────────────────────────────────

export const getNotificationsValidator = z.object({
  // cursor is the `id` of the last notification from the previous page
  cursor: z.string().uuid('Invalid cursor').optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const notificationIdsValidator = z.object({
  notificationIds: z.array(z.string().min(1)).min(1),
})

export const notificationPreferencesValidator = z
  .object({
    marketInterests: z
      .array(z.enum(MARKET_INTERESTS))
      .max(MARKET_INTERESTS.length)
      .refine((interests) => new Set(interests).size === interests.length, {
        message: 'Market interests must not contain duplicates',
      }),
    inAppAlertsEnabled: z.boolean(),
    emailVolatilityAlertsEnabled: z.boolean(),
    dailyDigestEnabled: z.boolean(),
  })
  .strict()

// ─── PATCH /notifications/:id/read ───────────────────────────────────────────
// No body required — the id comes from the route param

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type GetNotificationsQuery = z.infer<typeof getNotificationsValidator>
