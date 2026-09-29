import { UnrecoverableError } from 'bullmq'

interface SmtpError {
  responseCode?: number
}

const isSmtpError = (err: unknown): err is SmtpError =>
  typeof err === 'object' && err !== null && 'responseCode' in err

/**
 * A 5xx SMTP response (e.g. "550 mailbox unavailable", "553 invalid
 * recipient") means the server permanently rejected the address — retrying
 * the same send will fail identically every time. A 4xx response (e.g.
 * "421 too busy") or a connection-level error (no responseCode at all, such
 * as ETIMEDOUT) is transient and worth BullMQ's normal retry/backoff.
 *
 * Call this from a worker's catch block so permanent rejections surface as
 * `UnrecoverableError`, which BullMQ moves straight to `failed` without
 * burning through `attempts` (and without paging on-call for something a
 * retry can never fix).
 */
export function rethrowEmailError(err: unknown, to: string): never {
  if (isSmtpError(err) && err.responseCode !== undefined) {
    const code = err.responseCode
    if (code >= 500 && code < 600) {
      const message =
        err instanceof Error ? err.message : `SMTP ${code} rejecting ${to}`
      throw new UnrecoverableError(message)
    }
  }
  throw err
}
