import config from '@/config'
import { Queue, Worker } from 'bullmq'
import { getRedisClient } from '../../shared/infrastructure/cache'
import { CACHE_TTL } from '../../shared/constants'
import { alertJobFailure } from '../../shared/infrastructure/job-alert'
import { logger } from '../../shared/infrastructure/logger'
import { runTeamInviteCleanupJob } from '../teams/public'
import { runSubscriptionExpiryJob } from './subscription-job'

const JOB_DEFINITIONS = [
  {
    name: 'subscription-expiry',
    handler: runSubscriptionExpiryJob,
    pattern: '0 7 * * *',
  },
  {
    name: 'team-invite-cleanup',
    handler: runTeamInviteCleanupJob,
    pattern: '30 7 * * *',
  },
]

const queues: Queue[] = []
const workers: Worker[] = []

/**
 * Start the daily billing-cycle cron jobs (reminder/grace/downgrade) and the
 * expired team-invite cleanup that runs alongside them.
 * Gated behind `config.features.enableSubscriptionCron` — no-op if the flag
 * is off or Redis isn't connected, matching the news/watchlist cron pattern.
 */
export const startSubscriptionCronJobs = async (): Promise<void> => {
  if (!config.features.enableSubscriptionCron) return

  const connection = getRedisClient()
  if (!connection) {
    logger.warn(
      '[SubscriptionCron] No Redis connection found — subscription jobs will not be registered.',
    )
    return
  }

  for (const job of JOB_DEFINITIONS) {
    const queue = new Queue(job.name, { connection, skipVersionCheck: true })

    await queue.add(
      job.name,
      {},
      {
        repeat: { pattern: job.pattern },
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { age: CACHE_TTL.JOBS.SUBSCRIPTION_JOB_COMPLETED },
        removeOnFail: { age: CACHE_TTL.JOBS.SUBSCRIPTION_JOB_FAILED },
      },
    )

    queues.push(queue)

    const worker = new Worker(
      job.name,
      async () => {
        await job.handler()
      },
      { connection, skipVersionCheck: true },
    )
    worker.on('completed', () =>
      logger.info(`[SubscriptionCron] ${job.name} completed`),
    )
    worker.on('failed', (failed, err) => {
      logger.error(`[SubscriptionCron] ${job.name} failed: ${err.message}`)
      void alertJobFailure({
        queue: 'subscription-cron',
        name: job.name,
        job: failed,
        error: err,
      })
    })
    workers.push(worker)
  }
}

/** Live queue handles for admin queue-health inspection (empty when cron is disabled). */
export const getSubscriptionQueues = (): readonly Queue[] => queues

export const stopSubscriptionCronJobs = async (): Promise<void> => {
  await Promise.all(workers.map((w) => w.close()))
  await Promise.all(queues.map((q) => q.close()))
  // Forget what was closed so a later start/stop cycle never re-closes stale handles.
  workers.length = 0
  queues.length = 0
}
