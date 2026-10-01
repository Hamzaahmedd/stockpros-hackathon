import type { Queue } from 'bullmq'
import { prisma } from '../../shared/infrastructure/database'
import { redactPii } from '../../shared/utils/redact'
import { AdminTargetType, logAdminRead } from '../access-control'
import { getAuthEmailQueue, getEmailQueue } from '../notifications/public'
import { getSubscriptionQueues } from '../payments/public'
import { ADMIN_FAILED_JOB_SAMPLE_SIZE, AdminQueueName } from './constants'
import type { AdminReadContext } from './types'

export interface UsageQuery {
  page: number
  limit: number
  userId?: string
  teamId?: string
  symbol?: string
  feature?: string
}

export async function searchUsage(ctx: AdminReadContext, query: UsageQuery) {
  const where = {
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.teamId ? { teamId: query.teamId } : {}),
    ...(query.symbol
      ? { symbol: { equals: query.symbol, mode: 'insensitive' as const } }
      : {}),
    ...(query.feature ? { feature: query.feature } : {}),
  }
  const [total, items] = await Promise.all([
    prisma.usageEvent.count({ where }),
    prisma.usageEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ])
  await logAdminRead(prisma, {
    adminId: ctx.adminId,
    ipAddress: ctx.ipAddress,
    targetType: AdminTargetType.USAGE,
    resultIds: [...new Set(items.map((item) => item.userId))],
    filterKeys: Object.keys(query).filter(
      (key) => key !== 'page' && key !== 'limit',
    ),
  })

  return { items, total, page: query.page, limit: query.limit }
}

async function describeQueue(name: string, queue: Queue | null) {
  if (!queue) return { name, available: false as const }

  const [counts, failed] = await Promise.all([
    queue.getJobCounts('active', 'waiting', 'delayed', 'failed', 'completed'),
    queue.getFailed(0, ADMIN_FAILED_JOB_SAMPLE_SIZE - 1),
  ])
  return {
    name,
    available: true as const,
    counts,
    recentFailures: failed.map((job) => ({
      id: job.id ?? null,
      name: job.name,
      attemptsMade: job.attemptsMade,
      failedReason: redactPii(job.failedReason ?? ''),
      failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    })),
  }
}

/** Job counts, failures and retry attempts for the email workers and subscription cron queues. */
export async function getQueueHealth() {
  const cronQueues = getSubscriptionQueues()
  return Promise.all([
    describeQueue(AdminQueueName.ALERT_EMAIL, getEmailQueue()),
    describeQueue(AdminQueueName.AUTH_EMAIL, getAuthEmailQueue()),
    ...cronQueues.map((queue) => describeQueue(queue.name, queue)),
  ])
}
