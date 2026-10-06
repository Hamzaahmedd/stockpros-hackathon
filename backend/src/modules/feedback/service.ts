import {
  FeedbackStatus,
  type FeedbackCategory,
  type PlanTier,
  type Prisma,
} from '@prisma/client'
import { NotFoundError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import type {
  FeedbackEntry,
  FeedbackListResult,
  FeedbackMetadata,
  FeedbackStatusChange,
  FeedbackStatusCounts,
} from './types'
import { sendFeedbackWebhook } from './webhook'

export interface SubmitFeedbackInput {
  userId: string
  /** From the authenticated session: the client cannot choose it. */
  planTier: PlanTier
  message: string
  page?: string
  category?: FeedbackCategory
  /** What the browser reported (already validated). */
  clientMetadata?: Omit<FeedbackMetadata, 'planTier'>
}

export async function submitFeedback(
  input: SubmitFeedbackInput,
): Promise<FeedbackEntry> {
  const metadata: FeedbackMetadata = {
    ...input.clientMetadata,
    planTier: input.planTier,
  }

  const entry = await prisma.feedback.create({
    data: {
      userId: input.userId,
      message: input.message,
      page: input.page ?? null,
      category: input.category ?? null,
      metadata: metadata as unknown as Prisma.InputJsonObject,
    },
  })

  logger.info(`[Feedback] New feedback submitted by userId=${input.userId}`)

  // After the row is saved, and not awaited: it never throws and must not delay the reply.
  void sendFeedbackWebhook({
    id: entry.id,
    category: entry.category,
    message: entry.message,
    page: entry.page,
    planTier: input.planTier,
  })

  return entry
}

const emptyCounts = (): FeedbackStatusCounts => ({
  [FeedbackStatus.NEW]: 0,
  [FeedbackStatus.READ]: 0,
  [FeedbackStatus.ARCHIVED]: 0,
})

export async function listFeedback(
  query: { cursor?: string; limit?: number; status?: FeedbackStatus } = {},
): Promise<FeedbackListResult> {
  const { cursor, limit = 20, status } = query

  let cursorCreatedAt: Date | undefined
  if (cursor) {
    const cursorRow = await prisma.feedback.findUnique({
      where: { id: cursor },
      select: { createdAt: true },
    })
    if (cursorRow) {
      cursorCreatedAt = cursorRow.createdAt
    }
  }

  const statusFilter = status ? { status } : {}

  const rows = await prisma.feedback.findMany({
    where: {
      ...statusFilter,
      ...(cursorCreatedAt && {
        OR: [
          { createdAt: { lt: cursorCreatedAt } },
          { createdAt: cursorCreatedAt, id: { lt: cursor } },
        ],
      }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      message: true,
      page: true,
      category: true,
      status: true,
      metadata: true,
      statusUpdatedAt: true,
      createdAt: true,
      user: {
        select: { id: true, displayName: true, email: true },
      },
    },
  })

  const hasMore = rows.length > limit
  const data = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? (data.at(-1)?.id ?? null) : null

  const [total, grouped] = await Promise.all([
    prisma.feedback.count({ where: statusFilter }),
    prisma.feedback.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  const counts = emptyCounts()
  for (const group of grouped) counts[group.status] = group._count._all

  return { data, nextCursor, hasMore, total, counts }
}

/**
 * Moves an entry between triage states. Idempotent: asking for the state it is
 * already in writes nothing. The change is logged by ids (never the message).
 */
export async function updateFeedbackStatus(
  actorId: string,
  id: string,
  status: FeedbackStatus,
): Promise<FeedbackStatusChange> {
  const existing = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true, status: true, statusUpdatedAt: true },
  })
  if (!existing) throw new NotFoundError('Feedback not found')

  if (existing.status === status) {
    return {
      id,
      status,
      statusUpdatedAt: existing.statusUpdatedAt,
      changed: false,
    }
  }

  const updated = await prisma.feedback.update({
    where: { id },
    data: {
      status,
      statusUpdatedAt: new Date(),
      statusUpdatedBy: actorId,
    },
    select: { id: true, status: true, statusUpdatedAt: true },
  })

  logger.info(
    `[Feedback] status changed feedbackId=${id} by=${actorId} from=${existing.status} to=${status}`,
  )

  return { ...updated, changed: true }
}
