import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import { FeedbackEntry, FeedbackListResult } from './types'

export async function submitFeedback(
  userId: string,
  message: string,
  page?: string,
): Promise<FeedbackEntry> {
  const entry = await prisma.feedback.create({
    data: {
      userId,
      message,
      page: page ?? null,
    },
  })

  logger.info(`[Feedback] New feedback submitted by userId=${userId}`)

  return entry
}

export async function listFeedback(
  query: { cursor?: string; limit?: number } = {},
): Promise<FeedbackListResult> {
  const { cursor, limit = 20 } = query

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

  const rows = await prisma.feedback.findMany({
    where: {
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
      createdAt: true,
      user: {
        select: { id: true, displayName: true, email: true },
      },
    },
  })

  const hasMore = rows.length > limit
  const data = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? data[data.length - 1].id : null
  const total = await prisma.feedback.count()

  return { data, nextCursor, hasMore, total }
}
