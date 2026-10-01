import { Queue, UnrecoverableError, Worker } from 'bullmq'
import type { z } from 'zod'
import { getRedisClient } from '../../../shared/infrastructure/cache'
import {
  transporter,
  getLogoSrc,
} from '../../../shared/infrastructure/config/email'
import { rethrowEmailError } from '../../../shared/infrastructure/email-delivery'
import { logger } from '../../../shared/infrastructure/logger'
import { redactPii } from '../../../shared/utils/redact'
import {
  alertEmailJobSchema,
  paymentReceiptJobSchema,
  renewalReminderJobSchema,
  teamInviteJobSchema,
  type EmailJobPayload,
  type PaymentReceiptEmailJobPayload,
  type RenewalReminderEmailJobPayload,
  type TeamInviteEmailJobPayload,
} from '../email-job-schemas'
import { buildPaymentReceiptEmail } from '../email-templates/payment-receipt'
import { buildAlertEmail } from '../email-templates/watchlist-alert'
import { buildRenewalReminderEmail } from '../email-templates/subscription-renewal'
import { buildTeamInviteEmail } from '../email-templates/team-invite'
import {
  ALERT_EMAIL_DEFAULT_JOB_OPTIONS,
  ALERT_EMAIL_JOB_NAME,
  ALERT_EMAIL_QUEUE_NAME,
  ALERT_EMAIL_QUEUE_OPTIONS,
  PAYMENT_RECEIPT_JOB_NAME,
  RENEWAL_REMINDER_JOB_NAME,
  TEAM_INVITE_JOB_NAME,
} from './alert-email.config'

type EmailQueueJobPayload =
  | EmailJobPayload
  | RenewalReminderEmailJobPayload
  | TeamInviteEmailJobPayload
  | PaymentReceiptEmailJobPayload

interface JobRef {
  id?: string
  name: string
  data: unknown
}

// ─── Queue ────────────────────────────────────────────────────────────────────

let _emailQueue: Queue<EmailQueueJobPayload> | null = null

export const getEmailQueue = (): Queue<EmailQueueJobPayload> | null => {
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

let emailWorker: Worker | null = null

/**
 * Validates what came back out of Redis instead of trusting it. A malformed
 * job can never succeed on retry, so it fails permanently (no backoff churn)
 * and is logged by job id and field names only — never by value.
 */
const parsePayload = <T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  job: JobRef,
): T => {
  const result = schema.safeParse(job.data)
  if (result.success) return result.data

  logger.error(
    '[EmailWorker] Dropping job with an invalid payload',
    undefined,
    {
      jobId: job.id,
      jobName: job.name,
      fields: result.error.issues
        .map((issue) => issue.path.join('.'))
        .join(','),
    },
  )
  throw new UnrecoverableError('Invalid email job payload')
}

const sendAlertEmail = async (job: JobRef): Promise<void> => {
  const { to, userId, title, body, symbol } = parsePayload(
    alertEmailJobSchema,
    job,
  )
  try {
    await transporter.sendMail({
      to,
      subject: title,
      text: body,
      html: buildAlertEmail(title, body, symbol, getLogoSrc()),
    })
  } catch (err) {
    rethrowEmailError(err)
  }
  logger.info('[EmailWorker] Alert email sent', {
    jobId: job.id,
    userId,
    symbol,
  })
}

const sendRenewalReminderEmail = async (job: JobRef): Promise<void> => {
  const { to, subscriptionId, userName, amount, renewsOn, manageUrl, variant } =
    parsePayload(renewalReminderJobSchema, job)
  const { subject, html, text } = buildRenewalReminderEmail(
    { userName, amount, renewsOn, manageUrl, variant },
    getLogoSrc(),
  )
  try {
    await transporter.sendMail({ to, subject, text, html })
  } catch (err) {
    rethrowEmailError(err)
  }
  logger.info('[EmailWorker] Renewal reminder sent', {
    jobId: job.id,
    subscriptionId,
    variant,
  })
}

const sendTeamInviteEmail = async (job: JobRef): Promise<void> => {
  const {
    to,
    inviteId,
    teamId,
    inviterName,
    teamName,
    inviteUrl,
    role,
    expiresAt,
  } = parsePayload(teamInviteJobSchema, job)
  const { subject, html, text } = buildTeamInviteEmail(
    { inviterName, teamName, inviteUrl, role, expiresAt },
    getLogoSrc(),
  )
  try {
    await transporter.sendMail({ to, subject, text, html })
  } catch (err) {
    rethrowEmailError(err)
  }
  logger.info('[EmailWorker] Team invite sent', {
    jobId: job.id,
    inviteId,
    teamId,
    role,
  })
}

const sendPaymentReceiptEmail = async (job: JobRef): Promise<void> => {
  const { to, transactionId, teamId, ...receipt } = parsePayload(
    paymentReceiptJobSchema,
    job,
  )
  const { subject, html, text } = buildPaymentReceiptEmail(
    receipt,
    getLogoSrc(),
  )
  try {
    await transporter.sendMail({ to, subject, text, html })
  } catch (err) {
    rethrowEmailError(err)
  }
  logger.info('[EmailWorker] Payment receipt sent', {
    jobId: job.id,
    transactionId,
    teamId,
  })
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

  emailWorker = new Worker(
    ALERT_EMAIL_QUEUE_NAME,
    async (job) => {
      if (job.name === RENEWAL_REMINDER_JOB_NAME) {
        return sendRenewalReminderEmail(job)
      }
      if (job.name === PAYMENT_RECEIPT_JOB_NAME) {
        return sendPaymentReceiptEmail(job)
      }
      if (job.name === TEAM_INVITE_JOB_NAME) {
        return sendTeamInviteEmail(job)
      }
      return sendAlertEmail(job)
    },
    { connection, ...ALERT_EMAIL_QUEUE_OPTIONS },
  )

  // Provider errors often echo the recipient ("550 <user@x.com>: rejected");
  // the logger scrubs addresses from every message as a backstop.
  emailWorker.on('failed', (job, err) =>
    logger.error(
      `[EmailWorker] Job ${job?.id} failed after ${job?.attemptsMade} attempts: ${redactPii(err.message)}`,
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

// ─── Enqueue Helpers ──────────────────────────────────────────────────────────

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

/** Add a team-invite email job to the same queue (retries/backoff from the queue defaults). */
export const enqueueTeamInviteEmail = async (
  payload: TeamInviteEmailJobPayload,
): Promise<void> => {
  const queue = getEmailQueue()
  if (queue) {
    await queue.add(TEAM_INVITE_JOB_NAME, payload)
  } else {
    logger.warn(
      '[EmailWorker] Skipping team invite enqueue - Redis not connected',
    )
  }
}

/** Add a team payment receipt job to the same queue. */
export const enqueuePaymentReceiptEmail = async (
  payload: PaymentReceiptEmailJobPayload,
): Promise<void> => {
  const queue = getEmailQueue()
  if (queue) {
    await queue.add(PAYMENT_RECEIPT_JOB_NAME, payload)
  } else {
    logger.warn(
      '[EmailWorker] Skipping payment receipt enqueue - Redis not connected',
    )
  }
}
