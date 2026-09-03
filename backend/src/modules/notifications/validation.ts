import { z } from 'zod'

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
    dailyDigestEnabled: z.boolean(),
  })
  .strict()

// ─── PATCH /notifications/:id/read ───────────────────────────────────────────
// No body required — the id comes from the route param

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type GetNotificationsQuery = z.infer<typeof getNotificationsValidator>
