import type { Queue } from 'bullmq'
import { redactPii } from '../../shared/utils/redact'
import { getAuthEmailQueue, getEmailQueue } from '../notifications/public'
import { getSubscriptionQueues } from '../payments/public'
import { ADMIN_FAILED_JOB_SAMPLE_SIZE, AdminQueueName } from './constants'

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
