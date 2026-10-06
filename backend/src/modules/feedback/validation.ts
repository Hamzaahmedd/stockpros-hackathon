import { FeedbackCategory, FeedbackStatus } from '@prisma/client'
import z from 'zod'
import {
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_PAGE_MAX,
  METADATA_APP_VERSION_MAX,
  METADATA_USER_AGENT_MAX,
  METADATA_VIEWPORT_MAX,
  METADATA_VIEWPORT_MIN,
} from './constants'

/** No control characters: these values end up in logs and admin screens. */
const printable = (value: string): boolean =>
  !/[\u0000-\u001F\u007F]/.test(value)

const viewportDimension = z
  .number()
  .int()
  .min(METADATA_VIEWPORT_MIN)
  .max(METADATA_VIEWPORT_MAX)

/**
 * What the browser reports. Strict on purpose: the plan tier is never taken
 * from the client (the server adds it from the session), so a client that sends
 * one, or anything else unexpected, is rejected rather than stored.
 */
export const clientMetadataValidator = z
  .object({
    userAgent: z
      .string()
      .trim()
      .max(METADATA_USER_AGENT_MAX)
      .refine(printable, 'userAgent contains control characters')
      .optional(),
    viewport: z
      .object({ width: viewportDimension, height: viewportDimension })
      .strict()
      .optional(),
    appVersion: z
      .string()
      .trim()
      .max(METADATA_APP_VERSION_MAX)
      .refine(printable, 'appVersion contains control characters')
      .optional(),
  })
  .strict()

export const submitFeedbackValidator = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Feedback message is required')
    .max(
      FEEDBACK_MESSAGE_MAX,
      `Feedback message must be ${FEEDBACK_MESSAGE_MAX} characters or fewer`,
    ),
  page: z.string().trim().max(FEEDBACK_PAGE_MAX).optional(),
  category: z.nativeEnum(FeedbackCategory).optional(),
  metadata: clientMetadataValidator.optional(),
})

export const getFeedbackQueryValidator = z.object({
  cursor: z.string().uuid('Invalid cursor').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(FeedbackStatus).optional(),
})

export const feedbackIdParamValidator = z.object({
  id: z.string().uuid('Invalid feedback id'),
})

export const updateFeedbackStatusValidator = z.object({
  status: z.nativeEnum(FeedbackStatus),
})
