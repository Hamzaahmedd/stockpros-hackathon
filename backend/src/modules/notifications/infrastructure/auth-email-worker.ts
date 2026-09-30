import { Queue, UnrecoverableError, Worker } from 'bullmq'
import { getRedisClient } from '../../../shared/infrastructure/cache'
import {
  transporter,
  getLogoSrc,
} from '../../../shared/infrastructure/config/email'
import { rethrowEmailError } from '../../../shared/infrastructure/email-delivery'
import { logger } from '../../../shared/infrastructure/logger'
import { redactPii } from '../../../shared/utils/redact'
import { buildMagicLinkEmail } from '../email-templates/index'
import { authEmailJobSchema } from '../email-job-schemas'
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

let authEmailWorker: Worker | null = null

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

  authEmailWorker = new Worker(
    AUTH_EMAIL_QUEUE_NAME,
    async (job) => {
      // Redis-borne data is validated, not cast. A malformed job can never
      // succeed on retry, so it fails permanently; the payload holds a login
      // link (a credential), so only the field names are logged.
      const parsed = authEmailJobSchema.safeParse(job.data)
      if (!parsed.success) {
        logger.error(
          '[AuthEmailWorker] Dropping job with an invalid payload',
          undefined,
          {
            jobId: job.id,
            fields: parsed.error.issues.map((i) => i.path.join('.')).join(','),
          },
        )
        throw new UnrecoverableError('Invalid auth email job payload')
      }
      const { to, loginLink, expiryMinutes } = parsed.data
      const emailContent = buildMagicLinkEmail(
        loginLink,
        expiryMinutes,
        getLogoSrc(),
      )

      try {
        await transporter.sendMail({ to, ...emailContent })
      } catch (err) {
        rethrowEmailError(err)
      }

      logger.info('[AuthEmailWorker] Magic link sent', { jobId: job.id })
    },
    { connection, ...AUTH_EMAIL_QUEUE_OPTIONS },
  )

  authEmailWorker.on('failed', (job, err) =>
    logger.error(
      `[AuthEmailWorker] Job ${job?.id} failed after ${job?.attemptsMade} attempts: ${redactPii(err.message)}`,
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
