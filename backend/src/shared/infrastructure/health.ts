/**
 * Public infrastructure health probe (GET /health).
 *
 * Intended for load balancers, uptime monitors, and platform health
 * checks (Render/Railway).  Design constraints:
 *
 * - Unauthenticated, and mounted before rate limiting in `createApp`, so
 *   high-frequency pollers are never throttled and the endpoint stays
 *   outside every request-scoped middleware (analytics/audit logging
 *   included).
 * - Dependency probes are cached for a short TTL with single-flight
 *   semantics: a flood of health requests triggers at most one
 *   `SELECT 1` and one Redis `PING` per window, so health traffic can
 *   never exhaust the Prisma connection pool.
 * - Failure payloads expose generic dependency names only — never
 *   hostnames, credentials, stack traces, or raw error messages.
 */
import { Router } from 'express'
import { pingRedis } from './cache'
import { prisma } from './database'
import { logger } from './logger'

/** How long a dependency-probe result may be reused. */
const HEALTH_CACHE_TTL_MS = 5_000
/** Upper bound for the Postgres `SELECT 1` probe. */
const DB_PING_TIMEOUT_MS = 2_000
/** Upper bound for the Redis `PING` probe. */
const REDIS_PING_TIMEOUT_MS = 1_500

type DependencyStatus = 'up' | 'unavailable' | 'skipped'

interface ProbeResult {
  database: DependencyStatus
  redis: DependencyStatus
  expiresAt: number
}

let cachedProbe: ProbeResult | null = null
let inFlightProbe: Promise<ProbeResult> | null = null

/** Resolves with `promise`'s value, or rejects when `ms` elapses first. */
const withTimeout = <T>(promise: PromiseLike<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('probe timed out')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/**
 * Cheapest possible Postgres round-trip: a plain `SELECT 1` borrows a
 * pooled connection for microseconds.  Combined with the TTL cache it
 * puts no meaningful pressure on the pool.
 */
const probeDatabase = async (): Promise<DependencyStatus> => {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DB_PING_TIMEOUT_MS)
    return 'up'
  } catch {
    return 'unavailable'
  }
}

/**
 * Redis is optional by design (the app degrades to no-cache mode), so an
 * unreachable Redis is logged as degraded service but does not fail the
 * probe — the instance can still serve traffic.
 */
const probeRedis = async (): Promise<DependencyStatus> => {
  try {
    const reachable = await withTimeout(pingRedis(), REDIS_PING_TIMEOUT_MS)
    if (reachable === null) return 'skipped'
    return reachable ? 'up' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

const runProbes = async (): Promise<ProbeResult> => {
  const [database, redis] = await Promise.all([probeDatabase(), probeRedis()])

  if (database === 'unavailable') {
    logger.error('Health check: database unreachable.')
  }
  if (redis === 'unavailable') {
    logger.warn('Health check: Redis unreachable — serving in degraded (no-cache) mode.')
  }

  return { database, redis, expiresAt: Date.now() + HEALTH_CACHE_TTL_MS }
}

/** Cached, single-flight dependency probe shared by concurrent requests. */
const getProbe = (): Promise<ProbeResult> => {
  if (cachedProbe && cachedProbe.expiresAt > Date.now()) {
    return Promise.resolve(cachedProbe)
  }
  if (!inFlightProbe) {
    inFlightProbe = runProbes()
      .then((result) => {
        cachedProbe = result
        return result
      })
      .finally(() => {
        inFlightProbe = null
      })
  }
  return inFlightProbe
}

export const healthRouter = Router()

/**
 * @swagger
 * tags:
 *   - name: Health
 *     description: Public infrastructure health probe
 *
 * /health:
 *   get:
 *     summary: Liveness / readiness probe
 *     description: >
 *       Unauthenticated endpoint for load balancers and uptime monitors.
 *       Dependency probes are cached for 5 seconds, so high-frequency
 *       polling is safe. Returns 503 when PostgreSQL is unreachable.
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Instance is healthy and ready to serve traffic.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       503:
 *         description: A core dependency (PostgreSQL) is unreachable.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 dependencies:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       enum: [up, unavailable, skipped]
 *                     redis:
 *                       type: string
 *                       enum: [up, unavailable, skipped]
 */
healthRouter.get('/', async (_req, res) => {
  try {
    const { database, redis } = await getProbe()

    // PostgreSQL is the single core dependency (required at boot, used by
    // every business module) — its failure marks the instance not-ready.
    if (database === 'unavailable') {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        dependencies: { database, redis },
      })
      return
    }

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  } catch {
    // Defensive: probes never throw, but a health endpoint must always
    // answer — fail closed with a generic, detail-free payload.
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
    })
  }
})
