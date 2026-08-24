import { Queue, Worker }   from 'bullmq';
import { getRedisClient }     from '../../../shared/infrastructure/cache';
import { logger } from '../../../shared/infrastructure/logger'
import { transporter } from '../../../shared/infrastructure/config/email';
import { buildAlertEmail } from '../email-templates/watchlist-alert';
import type { EmailJobPayload } from '../types';

// ─── Config ───────────────────────────────────────────────────────────────────

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? process.env.SMTP_USER ?? 'stockplatform.app@gmail.com';



// ─── BullMQ Queue ─────────────────────────────────────────────────────────────



const EMAIL_QUEUE_NAME = 'watchlist-email-notifications';

let _emailQueue: Queue<EmailJobPayload> | null = null;

const getEmailQueue = (): Queue<EmailJobPayload> | null => {
  const connection = getRedisClient();
  if (!connection) return null;
  if (!_emailQueue) {
    _emailQueue = new Queue<EmailJobPayload>(EMAIL_QUEUE_NAME, {
      connection,
      skipVersionCheck: true,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { age: 24 * 60 * 60 },
        removeOnFail: { age: 72 * 60 * 60 },
      },
    });
  }
  return _emailQueue;
};

// ─── Worker ───────────────────────────────────────────────────────────────────

let emailWorker: Worker<EmailJobPayload> | null = null;

/**
 * Start the email worker.
 * Call once at server boot alongside startCronScheduler.
 */
export const startEmailWorker = (): void => {
  const connection = getRedisClient();
  if (!connection) {
    logger.warn('[EmailWorker] No Redis connection found — email worker will not be started.');
    return;
  }

  emailWorker = new Worker<EmailJobPayload>(
    EMAIL_QUEUE_NAME,
    async (job) => {
      const { to, title, body, symbol } = job.data

      await transporter.sendMail({
        from: FROM_ADDRESS,
        to,
        subject: title,
        text: body,
        html: buildAlertEmail(title, body, symbol),
      })

      logger.info(`[EmailWorker] Sent "${title}" to ${to}`)
    },
    { connection, skipVersionCheck: true },
  )

  emailWorker.on('failed', (job, err) =>
    logger.error(
      `[EmailWorker] Job ${job?.id} failed after ${job?.attemptsMade} attempts: ${err.message}`,
    ),
  );

  logger.info('[EmailWorker] Started');
};

/**
 * Stop the email worker.
 * Call in SIGTERM/SIGINT handlers.
 */
export const stopEmailWorker = async (): Promise<void> => {
  await emailWorker?.close();
  if (_emailQueue) {
    await _emailQueue.close();
  }
  logger.info('[EmailWorker] Stopped');
};

// ─── Enqueue Helper ───────────────────────────────────────────────────────────

/**
 * Add an email notification job to the queue.
 * Called by notificationService after the in-app Notification row is written.
 * Non-blocking — never awaited in the tick pipeline.
 */
export const enqueueEmail = async (payload: EmailJobPayload): Promise<void> => {
  const queue = getEmailQueue();
  if (queue) {
    await queue.add('send-alert-email' as any, payload);
  } else {
    logger.warn('[EmailWorker] Skipping email enqueue - Redis not connected');
  }
};
