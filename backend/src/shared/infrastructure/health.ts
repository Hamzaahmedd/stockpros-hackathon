import type { Request, Response } from 'express'
import { prisma } from './database'
import { logger } from './logger'

/**
 * Lightweight, non-blocking health check handler for infrastructure monitoring (GET /health).
 * Performs a fast SELECT 1 query to verify database readiness without leaking sensitive internals.
 */
export async function healthCheckHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  const timestamp = new Date().toISOString()

  // 1. Basic container liveness check (Must ALWAYS return 200 OK for Render deploys)
  if (_req.query.type !== 'deep') {
    res.status(200).json({ status: 'ok', timestamp })
    return
  }

  // 2. Optional deep readiness check (for internal monitoring)
  try {
    const dbPing = prisma.$queryRaw`SELECT 1`
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Health check timeout')), 2000),
    )

    await Promise.race([dbPing, timeout])
    res.status(200).json({ status: 'ok', database: 'connected', timestamp })
  } catch (error) {
    logger.error(
      'Deep health check failed:',
      error instanceof Error ? error.message : error,
    )
    res.status(503).json({ status: 'unhealthy', timestamp })
  }
}
