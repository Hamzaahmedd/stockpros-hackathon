import { z } from 'zod'
import { AlertType } from '@prisma/client'

// ─── Add to Watchlist ────────────────────────────────────────────────────────

export const addToWatchlistValidator = z.object({
  symbol: z
    .string()
    .min(1, 'Symbol is required')
    .max(10, 'Symbol must be 10 characters or fewer')
    .transform((s) => s.toUpperCase()),
  targetEntryPrice: z
    .number()
    .positive('Target entry price must be positive')
    .optional(),
  stopLoss: z.number().positive('Stop loss must be positive').optional(),
  notes: z
    .string()
    .max(500, 'Notes must be 500 characters or fewer')
    .optional(),
})

// ─── Update Watchlist Entry ──────────────────────────────────────────────────

export const updateWatchlistValidator = z
  .object({
    targetEntryPrice: z
      .number()
      .positive('Target entry price must be positive')
      .optional(),
    stopLoss: z.number().positive('Stop loss must be positive').optional(),
    notes: z
      .string()
      .max(500, 'Notes must be 500 characters or fewer')
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

// ─── Convert to Position ─────────────────────────────────────────────────────

export const convertToPositionValidator = z.object({
  entryPrice: z.number().positive('Entry price must be positive').optional(),
  // Float to match Position.quantity — fractional shares are allowed (e.g. 0.5)
  quantity: z.number().positive('Quantity must be positive').optional(),
})

// ─── Create Alert ─────────────────────────────────────────────────────────────

export const createAlertValidator = z.object({
  type: z.nativeEnum(AlertType),
  threshold: z.number().optional(),
})

// ─── Update Alert ─────────────────────────────────────────────────────────────

export const updateAlertValidator = z
  .object({
    threshold: z.number().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type AddToWatchlistInput = z.infer<typeof addToWatchlistValidator>
export type UpdateWatchlistInput = z.infer<typeof updateWatchlistValidator>
export type ConvertToPositionInput = z.infer<typeof convertToPositionValidator>
export type CreateAlertInput = z.infer<typeof createAlertValidator>
export type UpdateAlertInput = z.infer<typeof updateAlertValidator>
