import { OpsAlertKind, sendOpsAlert } from './ops-alert'

/** The parts of a BullMQ job this needs, so shared code does not depend on bullmq. */
export interface JobLike {
  id?: string
  name?: string
  attemptsMade: number
  opts?: { attempts?: number }
}

/**
 * True once BullMQ will not try the job again. A job queued without an
 * `attempts` option runs once, so its first failure is final. A missing job
 * (BullMQ can report one that was already removed) is treated as final too.
 */
export const isFinalFailure = (job: JobLike | undefined): boolean =>
  !job || job.attemptsMade >= (job.opts?.attempts ?? 1)

/** Keeps a label to plain id characters, so it is safe in a throttle key and in the alert. */
const slug = (value: string): string =>
  value.replace(/[^A-Za-z0-9_.:-]+/g, '-').slice(0, 60)

export interface JobFailure {
  /** Which worker: a stable label such as "email" or "news-cron". */
  queue: string
  /** The job's name when the worker has a better one than the job carries (cron definitions). */
  name?: string
  job?: JobLike
  error: unknown
}

/**
 * Tells the ops channel a background job has failed for good. Transient
 * failures that BullMQ will retry stay quiet, and a failing queue produces one
 * alert per window (see the throttle), not one per job.
 *
 * The alert names the queue, the job and its id, the attempts made and the
 * error class: never the error message, which can echo a recipient or a URL.
 * Never throws; call it as `void alertJobFailure(...)` from a `failed` handler.
 */
export async function alertJobFailure({
  queue,
  name,
  job,
  error,
}: JobFailure): Promise<void> {
  if (!isFinalFailure(job)) return

  const jobName = slug(name ?? job?.name ?? 'unknown')
  await sendOpsAlert({
    kind: OpsAlertKind.JOB_FAILED,
    key: `${slug(queue)}:${jobName}`,
    details: {
      queue,
      job: jobName,
      ...(job?.id ? { jobId: job.id } : {}),
      attempts: job?.attemptsMade ?? 0,
      error: error instanceof Error ? error.name : 'unknown',
    },
  })
}
