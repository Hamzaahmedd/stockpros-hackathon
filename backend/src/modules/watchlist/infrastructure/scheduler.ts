import { Queue, Worker } from 'bullmq'
import {
  runEarningsAlertJob,
  runDividendAlertJob,
  runAnalystRatingJob,
  runNewsAlertJob,
  runSecFilingJob,
  runAiZoneRecomputeJob,
} from './watchlist-job'
import { sendDailyDigestsToAllSubscribers } from '../../notifications/public'
import { logger } from '../../../shared/infrastructure/logger'
import { getRedisClient } from '../../../shared/infrastructure/cache'
import type { JobDefinition } from './types'

const US_EASTERN_TIME_ZONE = 'America/New_York'
const PREMARKET_DIGEST_CRON = '30 8 * * 1-5'

// ─── Job Definitions ──────────────────────────────────────────────────────────

const JOB_DEFINITIONS: JobDefinition[] = [
  {
    name: 'watchlist-earnings-alert',
    handler: runEarningsAlertJob,
    pattern: '0 8 * * *', // daily at 08:00 UTC
  },
  {
    name: 'watchlist-dividend-alert',
    handler: runDividendAlertJob,
    pattern: '0 8 * * *',
  },
  {
    name: 'watchlist-analyst-rating',
    handler: runAnalystRatingJob,
    pattern: '0 9 * * *', // daily at 09:00 UTC
  },
  {
    name: 'watchlist-sec-filing',
    handler: runSecFilingJob,
    pattern: '0 10 * * *', // daily at 10:00 UTC
  },
  {
    name: 'watchlist-ai-recompute',
    handler: runAiZoneRecomputeJob,
    pattern: '0 3 * * *', // daily at 03:00 UTC (off-peak)
  },
  {
    name: 'watchlist-news-alert',
    handler: runNewsAlertJob,
    pattern: '*/15 * * * *', // every 15 minutes
  },
  {
    name: 'watchlist-premarket-digest',
    handler: sendDailyDigestsToAllSubscribers,
    pattern: PREMARKET_DIGEST_CRON,
    timeZone: US_EASTERN_TIME_ZONE,
  },
]

const queues: Queue[] = []
const workers: Worker[] = []

// ─── Start ────────────────────────────────────────────────────────────────────

/**
 * Register all cron queues and workers.
 * Call once at server boot, after Redis is connected.
 *
 * Each job function from watchlistCronJobs.ts plugs straight in as a
 * BullMQ processor — no changes to job logic required.
 */
export const startCronScheduler = async (): Promise<void> => {
  const connection = getRedisClient()
  if (!connection) {
    logger.warn(
      '[CronScheduler] No Redis connection found — cron jobs will not be registered.',
    )
    return
  }

  for (const job of JOB_DEFINITIONS) {
    // Queue holds the repeating job definition
    const queue = new Queue(job.name, { connection, skipVersionCheck: true })

    // Upsert the repeating job — safe to call on every boot.
    // BullMQ deduplicates by queue name + repeat pattern.
    await queue.add(
      job.name,
      {},
      {
        repeat: {
          pattern: job.pattern,
          ...(job.timeZone ? { tz: job.timeZone } : {}),
        },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    )

    queues.push(queue)

    // Worker processes jobs from the queue
    const worker = new Worker(
      job.name,
      async () => {
        await job.handler()
      },
      { connection, skipVersionCheck: true },
    )

    worker.on('completed', () =>
      logger.info(`[CronScheduler] ${job.name} completed`),
    )
    worker.on('failed', (_, err) =>
      logger.error(`[CronScheduler] ${job.name} failed: ${err.message}`),
    )

    workers.push(worker)
    logger.info(
      `[CronScheduler] Registered: ${job.name} (${job.pattern}${job.timeZone ? `, ${job.timeZone}` : ''})`,
    )
  }

  logger.info('[CronScheduler] All jobs registered')
}

// ─── Stop ─────────────────────────────────────────────────────────────────────

/**
 * Gracefully close all workers and queues.
 * Call in SIGTERM/SIGINT handlers.
 */
export const stopCronScheduler = async (): Promise<void> => {
  await Promise.all(workers.map((w) => w.close()))
  await Promise.all(queues.map((q) => q.close()))
  logger.info('[CronScheduler] All jobs stopped')
}
