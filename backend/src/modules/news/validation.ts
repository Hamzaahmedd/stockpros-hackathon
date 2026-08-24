import { z }            from 'zod'
import { NewsCategory } from '@prisma/client'

const cursorSchema   = z.string().uuid('Invalid cursor').optional()
const limitSchema    = z.coerce.number().int().min(1).max(50).default(20)
const categorySchema = z.nativeEnum(NewsCategory).optional()

export const newsFeedValidator = z.object({
  cursor:   cursorSchema,
  limit:    limitSchema,
  category: categorySchema,
  symbol:   z.string().max(10).transform(s => s.toUpperCase()).optional(),
  filter:   z.enum(['portfolio', 'watchlist', 'all']).default('all'),
})

export const newsSymbolValidator = z.object({
  limit: limitSchema,
  cursor: cursorSchema,
})

export const newsSearchValidator = z.object({
  q:        z.string().min(2, 'Search query must be at least 2 characters').optional(),
  symbol:   z.string().max(10).transform(s => s.toUpperCase()).optional(),
  category: categorySchema,
  from:     z.string().datetime({ offset: true }).optional(),
  to:       z.string().datetime({ offset: true }).optional(),
  cursor:   cursorSchema,
  limit:    limitSchema,
})

export const newsSavedValidator = z.object({
  cursor: cursorSchema,
  limit:  limitSchema,
})

export const articleIdsValidator = z.object({
  articleIds: z.array(z.string().min(1)).min(1),
})

export type NewsFeedQuery   = z.infer<typeof newsFeedValidator>
export type NewsSymbolQuery = z.infer<typeof newsSymbolValidator>
export type NewsSearchQuery = z.infer<typeof newsSearchValidator>
export type NewsSavedQuery  = z.infer<typeof newsSavedValidator>
