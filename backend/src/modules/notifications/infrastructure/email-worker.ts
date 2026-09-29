import { Queue, Worker } from 'bullmq'
import { getRedisClient } from '../../../shared/infrastructure/cache'
import {
  transporter,
  getLogoSrc,
} from '../../../shared/infrastructure/config/email'
import { rethrowEmailError } from '../../../shared/infrastructure/email-delivery'
import { logger } from '../../../shared/infrastructure/logger'
import { buildAlertEmail } from '../email-templates/watchlist-alert'
import { buildRenewalReminderEmail } from '../email-templates/subscription-renewal'
import type { EmailJobPayload, RenewalReminderEmailJobPayload } from '../types'
import {
  ALERT_EMAIL_DEFAULT_JOB_OPTIONS,
  ALERT_EMAIL_JOB_NAME,
  ALERT_EMAIL_QUEUE_NAME,
  ALERT_EMAIL_QUEUE_OPTIONS,
  RENEWAL_REMINDER_JOB_NAME,
} from './alert-email.config'

type EmailQueueJobPayload = EmailJobPayload | RenewalReminderEmailJobPayload

// ─── Queue ────────────────────────────────────────────────────────────────────

let _emailQueue: Queue<EmailQueueJobPayload> | null = null

const getEmailQueue = (): Queue<EmailQueueJobPayload> | null => {
  const connection = getRedisClient()
  if (!connection) return null
  _emailQueue ??= new Queue<EmailQueueJobPayload>(ALERT_EMAIL_QUEUE_NAME, {
    connection,
    ...ALERT_EMAIL_QUEUE_OPTIONS,
    defaultJobOptions: ALERT_EMAIL_DEFAULT_JOB_OPTIONS,
  })
  return _emailQueue
}

// ─── Worker ───────────────────────────────────────────────────────────────────

let emailWorker: Worker<EmailQueueJobPayload> | null = null

const sendAlertEmail = async (payload: EmailJobPayload): Promise<void> => {
  const { to, title, body, symbol } = payload
  try {
    await transporter.sendMail({
      to,
      subject: title,
      text: body,
      html: buildAlertEmail(title, body, symbol, getLogoSrc()),
    })
  } catch (err) {
    rethrowEmailError(err, to)
  }
  logger.info(`[EmailWorker] Sent "${title}" to ${to}`)
}

const sendRenewalReminderEmail = async (
  payload: RenewalReminderEmailJobPayload,
): Promise<void> => {
  const { to, userName, amount, renewsOn, manageUrl, variant } = payload
  const { subject, html, text } = buildRenewalReminderEmail(
    { userName, amount, renewsOn, manageUrl, variant },
    getLogoSrc(),
  )
  try {
    await transporter.sendMail({ to, subject, text, html })
  } catch (err) {
    rethrowEmailError(err, to)
  }
  logger.info(`[EmailWorker] Sent renewal reminder ("${variant}") to ${to}`)
}

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

  emailWorker = new Worker<EmailQueueJobPayload>(
    ALERT_EMAIL_QUEUE_NAME,
    async (job) => {
      if (job.name === RENEWAL_REMINDER_JOB_NAME) {
        await sendRenewalReminderEmail(
          job.data as RenewalReminderEmailJobPayload,
        )
        return
      }
      await sendAlertEmail(job.data as EmailJobPayload)
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

/** Add a subscription renewal reminder job to the same queue as alert emails. */
export const enqueueRenewalReminderEmail = async (
  payload: RenewalReminderEmailJobPayload,
): Promise<void> => {
  const queue = getEmailQueue()
  if (queue) {
    await queue.add(RENEWAL_REMINDER_JOB_NAME, payload)
  } else {
    logger.warn(
      '[EmailWorker] Skipping renewal reminder enqueue - Redis not connected',
    )
  }
}
