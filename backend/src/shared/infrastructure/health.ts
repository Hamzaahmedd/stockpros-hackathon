import type { Request, Response } from 'express'
import { prisma } from './database'
import { logger } from './logger'

/**
 * Lightweight, non-blocking health check handler for infrastructure monitoring (GET /health).
 * Performs a fast SELECT 1 query to verify database readiness without leaking sensitive internals.
 */
export async function healthCheckHandler(_req: Request, res: Response): Promise<void> {
  const timestamp = new Date().toISOString()

  try {
    // 2-second timeout guard to prevent connection pool starvation during high-frequency checks
    const dbPing = prisma.$queryRaw`SELECT 1`
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Health check timeout')), 2000),
    )

    await Promise.race([dbPing, timeout])

    res.status(200).json({
      status: 'ok',
      timestamp,
    })
  } catch (error) {
    logger.error('Health check failed:', error instanceof Error ? error.message : error)

    // Return 503 with safe, generic status without leaking internal hostnames or stack traces
    res.status(503).json({
      status: 'unhealthy',
      timestamp,
    })
  }
}
