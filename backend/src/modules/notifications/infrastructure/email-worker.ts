import { Queue, Worker } from 'bullmq'
import { getRedisClient } from '../../../shared/infrastructure/cache'
import { transporter } from '../../../shared/infrastructure/config/email'
import { logger } from '../../../shared/infrastructure/logger'
import { buildAlertEmail } from '../email-templates/watchlist-alert'
import type { EmailJobPayload } from '../types'
import {
  ALERT_EMAIL_DEFAULT_JOB_OPTIONS,
  ALERT_EMAIL_JOB_NAME,
  ALERT_EMAIL_QUEUE_NAME,
  ALERT_EMAIL_QUEUE_OPTIONS,
} from './alert-email.config'

// ─── Queue ────────────────────────────────────────────────────────────────────

let _emailQueue: Queue<EmailJobPayload> | null = null

const getEmailQueue = (): Queue<EmailJobPayload> | null => {
  const connection = getRedisClient()
  if (!connection) return null
  if (!_emailQueue) {
    _emailQueue = new Queue<EmailJobPayload>(ALERT_EMAIL_QUEUE_NAME, {
      connection,
      ...ALERT_EMAIL_QUEUE_OPTIONS,
      defaultJobOptions: ALERT_EMAIL_DEFAULT_JOB_OPTIONS,
    })
  }
  return _emailQueue
}

// ─── Worker ───────────────────────────────────────────────────────────────────

let emailWorker: Worker<EmailJobPayload> | null = null

/**
 * Start the email worker.
 * Call once at server boot alongside startCronScheduler.
 */
export const startEmailWorker = (): void => {
  const connection = getRedisClient()
  if (!connection) {
    logger.warn(
      '[EmailWorker] No Redis connection found — email worker will not be started.',
    )
    return
  }

  emailWorker = new Worker<EmailJobPayload>(
    ALERT_EMAIL_QUEUE_NAME,
    async (job) => {
      const { to, title, body, symbol } = job.data

      await transporter.sendMail({
        to,
        subject: title,
        text: body,
        html: buildAlertEmail(title, body, symbol),
      })

      logger.info(`[EmailWorker] Sent "${title}" to ${to}`)
    },
    { connection, ...ALERT_EMAIL_QUEUE_OPTIONS },
  )

  emailWorker.on('failed', (job, err) =>
    logger.error(
      `[EmailWorker] Job ${job?.id} failed after ${job?.attemptsMade} attempts: ${err.message}`,
    ),
  )

  logger.info('[EmailWorker] Started')
}

/**
 * Stop the email worker.
 * Call in SIGTERM/SIGINT handlers.
 */
export const stopEmailWorker = async (): Promise<void> => {
  await emailWorker?.close()
  if (_emailQueue) {
    await _emailQueue.close()
  }
  logger.info('[EmailWorker] Stopped')
}

// ─── Enqueue Helper ───────────────────────────────────────────────────────────

/**
 * Add an email notification job to the queue.
 * Called by notificationService after the in-app Notification row is written.
 * Non-blocking — never awaited in the tick pipeline.
 */
export const enqueueEmail = async (payload: EmailJobPayload): Promise<void> => {
  const queue = getEmailQueue()
  if (queue) {
    await queue.add(ALERT_EMAIL_JOB_NAME, payload)
  } else {
    logger.warn('[EmailWorker] Skipping email enqueue - Redis not connected')
  }
}
