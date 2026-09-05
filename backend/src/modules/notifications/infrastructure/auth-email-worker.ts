import { Queue, Worker } from 'bullmq'
import { getRedisClient } from '../../../shared/infrastructure/cache'
import { transporter, getLogoSrc } from '../../../shared/infrastructure/config/email'
import { logger } from '../../../shared/infrastructure/logger'
import { buildMagicLinkEmail } from '../email-templates/index'
import type { AuthEmailJobPayload } from '../types'
import {
  AUTH_EMAIL_DEFAULT_JOB_OPTIONS,
  AUTH_EMAIL_JOB_NAME,
  AUTH_EMAIL_QUEUE_NAME,
  AUTH_EMAIL_QUEUE_OPTIONS,
} from './auth-email.config'

// ─── Queue ────────────────────────────────────────────────────────────────────

let _authEmailQueue: Queue<AuthEmailJobPayload> | null = null

const getAuthEmailQueue = (): Queue<AuthEmailJobPayload> | null => {
  const connection = getRedisClient()
  if (!connection) return null
  if (!_authEmailQueue) {
    _authEmailQueue = new Queue<AuthEmailJobPayload>(AUTH_EMAIL_QUEUE_NAME, {
      connection,
      ...AUTH_EMAIL_QUEUE_OPTIONS,
      defaultJobOptions: AUTH_EMAIL_DEFAULT_JOB_OPTIONS,
    })
  }
  return _authEmailQueue
}

// ─── Worker ───────────────────────────────────────────────────────────────────

let authEmailWorker: Worker<AuthEmailJobPayload> | null = null

/**
 * Start the auth (magic-link) email worker.
 * Call once at server boot alongside startEmailWorker.
 */
export const startAuthEmailWorker = (): void => {
  const connection = getRedisClient()
  if (!connection) {
    logger.warn(
      '[AuthEmailWorker] No Redis connection found — auth email worker will not be started.',
    )
    return
  }

  authEmailWorker = new Worker<AuthEmailJobPayload>(
    AUTH_EMAIL_QUEUE_NAME,
    async (job) => {
      const { to, loginLink, expiryMinutes } = job.data
      const emailContent = buildMagicLinkEmail(loginLink, expiryMinutes, getLogoSrc())

      await transporter.sendMail({ to, ...emailContent })

      logger.info(`[AuthEmailWorker] Sent magic link to ${to}`)
    },
    { connection, ...AUTH_EMAIL_QUEUE_OPTIONS },
  )

  authEmailWorker.on('failed', (job, err) =>
    logger.error(
      `[AuthEmailWorker] Job ${job?.id} failed after ${job?.attemptsMade} attempts: ${err.message}`,
    ),
  )

  logger.info('[AuthEmailWorker] Started')
}

/**
 * Stop the auth email worker.
 * Call in SIGTERM/SIGINT handlers.
 */
export const stopAuthEmailWorker = async (): Promise<void> => {
  await authEmailWorker?.close()
  if (_authEmailQueue) {
    await _authEmailQueue.close()
  }
  logger.info('[AuthEmailWorker] Stopped')
}

// ─── Enqueue Helper ───────────────────────────────────────────────────────────

/** Enqueues a magic-link email. Returns false if Redis is unavailable so callers can fall back to a direct send. */
export const enqueueAuthEmail = async (
  payload: AuthEmailJobPayload,
): Promise<boolean> => {
  const queue = getAuthEmailQueue()
  if (!queue) {
    logger.warn(
      '[AuthEmailWorker] Redis not connected — magic-link email was not enqueued.',
    )
    return false
  }
  await queue.add(AUTH_EMAIL_JOB_NAME, payload)
  return true
}
