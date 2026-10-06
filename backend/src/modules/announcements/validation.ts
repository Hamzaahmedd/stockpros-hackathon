import z from 'zod'
import {
  CHANGELOG_DEFAULT_PAGE_SIZE,
  CHANGELOG_MAX_PAGE_SIZE,
} from './constants'

export const announcementIdParamValidator = z.object({
  id: z.string().uuid('Invalid announcement id'),
})

export const changelogQueryValidator = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CHANGELOG_MAX_PAGE_SIZE)
    .default(CHANGELOG_DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
})
