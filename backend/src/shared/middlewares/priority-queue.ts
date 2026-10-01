import config from '@/config'
import { NextFunction, RequestHandler, Response } from 'express'
import type { AuthenticatedRequest } from '../request-types'
import { ServiceUnavailableError } from '../errors'
import { logger } from '../infrastructure/logger'

/** Lower number = served first. */
export enum QueueTier {
  HIGH = 1,
  NORMAL = 10,
}

type Release = () => void

interface Waiter {
  tier: number
  seq: number
  grant: (release: Release) => void
  reject: (reason: unknown) => void
}

export class QueueFullError extends ServiceUnavailableError {
  constructor() {
    super('Server is busy — please retry shortly')
  }
}

export class QueueWaitTimeoutError extends ServiceUnavailableError {
  constructor() {
    super('Timed out waiting for compute capacity — please retry')
  }
}

/**
 * In-memory priority semaphore. At most `concurrency` holders run at once;
 * everyone else waits and is admitted lowest tier first, first-come-first-served
 * within a tier. Deliberately dependency-free: `p-queue` v7+ is ESM-only and
 * does not load in this CommonJS build.
 *
 * This bounds concurrency *per process*. Across multiple instances each
 * process enforces its own limit, which is the intended protection here (the
 * CPU/socket pressure being shed is local to the process).
 */
export class PriorityLimiter {
  private active = 0
  private nextSeq = 0
  private readonly waiters: Waiter[] = []

  constructor(
    private readonly concurrency: number,
    private readonly maxQueueDepth: number,
  ) {}

  get activeCount(): number {
    return this.active
  }

  get pendingCount(): number {
    return this.waiters.length
  }

  /**
   * Resolves with a `release` function once a slot is granted. Rejects with
   * `QueueFullError` if the wait queue is at capacity, or with the signal's
   * reason if `signal` aborts while still waiting.
   */
  acquire(tier: number, signal?: AbortSignal): Promise<Release> {
    if (signal?.aborted) return Promise.reject(signal.reason)

    if (this.active < this.concurrency && this.waiters.length === 0) {
      return Promise.resolve(this.take())
    }
    if (this.waiters.length >= this.maxQueueDepth) {
      return Promise.reject(new QueueFullError())
    }

    return new Promise<Release>((resolve, reject) => {
      const waiter: Waiter = {
        tier,
        seq: this.nextSeq++,
        grant: resolve,
        reject,
      }
      this.insert(waiter)

      signal?.addEventListener(
        'abort',
        () => {
          const index = this.waiters.indexOf(waiter)
          if (index === -1) return // already granted
          this.waiters.splice(index, 1)
          reject(signal.reason)
        },
        { once: true },
      )
    })
  }

  /** Sorted insert (tier, then arrival order). The queue is bounded, so linear is fine. */
  private insert(waiter: Waiter): void {
    let index = this.waiters.length
    while (index > 0 && this.waiters[index - 1].tier > waiter.tier) index -= 1
    this.waiters.splice(index, 0, waiter)
  }

  private take(): Release {
    this.active += 1
    let released = false
    return () => {
      if (released) return
      released = true
      this.active -= 1
      this.admitNext()
    }
  }

  private admitNext(): void {
    while (this.active < this.concurrency && this.waiters.length > 0) {
      const next = this.waiters.shift()!
      next.grant(this.take())
    }
  }
}

let sharedLimiter: PriorityLimiter | null = null

/** One limiter shared by every compute-heavy route so they contend for the same capacity. */
export const getComputeLimiter = (): PriorityLimiter => {
  sharedLimiter ??= new PriorityLimiter(
    config.priorityQueue.concurrency,
    config.priorityQueue.maxQueueDepth,
  )
  return sharedLimiter
}

/** Test hook: drop the shared instance so the next call rebuilds it from config. */
export const resetComputeLimiter = (): void => {
  sharedLimiter = null
}

/**
 * Server-decided only. The `X-Queue-Priority` header is a *response* header
 * set by `attachTeamContext`; a client-supplied request header must never be
 * able to jump the queue, so priority comes from `req.teamContext`.
 */
export const resolveTier = (req: AuthenticatedRequest): QueueTier =>
  req.teamContext?.isHighPriority ? QueueTier.HIGH : QueueTier.NORMAL

/**
 * Admission control for compute-heavy routes: the request waits for a slot
 * (Team requests flagged high-priority go ahead of standard traffic) and holds
 * it until the response completes or the connection drops. Place it after
 * `attachTeamContext` and after quota/credit gating, so requests that will be
 * rejected never occupy a slot.
 *
 * A request that waits longer than `maxWaitMs`, or arrives when the wait queue
 * is full, is shed with a 503 instead of piling up.
 */
export const priorityQueue =
  (limiter: PriorityLimiter = getComputeLimiter()): RequestHandler =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const tier = resolveTier(req)
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(new QueueWaitTimeoutError()),
      config.priorityQueue.maxWaitMs,
    )
    // `res` closes when the client goes away *or* the response completes.
    const abortIfStillQueued = () => controller.abort()
    res.once('close', abortIfStillQueued)

    let release: Release
    try {
      release = await limiter.acquire(tier, controller.signal)
    } catch (error) {
      if (res.destroyed) {
        logger.debug('[PriorityQueue] Client left while queued')
        return
      }
      return next(error)
    } finally {
      clearTimeout(timer)
      res.off('close', abortIfStillQueued)
    }

    if (res.destroyed || res.writableEnded) {
      release()
      return
    }
    res.once('close', release)
    next()
  }
