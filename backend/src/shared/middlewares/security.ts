import config from '@/config'
import cors from 'cors'
import { Application, Request } from 'express'
import rateLimit, { MemoryStore } from 'express-rate-limit'
import helmet from 'helmet'
import { RedisSlidingWindowStore } from '../infrastructure/redis-sliding-window-store'
import { getRawRedisClient } from '../infrastructure/cache'

/**
 * Creates a rate limit store backed by Redis (sliding window log) when available,
 * falling back gracefully to in-memory store if Redis is unconfigured or offline.
 */
function createRateLimitStore(prefix: string) {
  const client = getRawRedisClient()
  if (client) {
    return new RedisSlidingWindowStore({
      client,
      prefix,
    })
  }
  return new MemoryStore()
}

// Rate limiter for passwordless magic link requests — keyed by EMAIL address
export const emailMagicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  limit: 5, // Allow up to 5 login attempts per SAME email per 15 minutes
  store: createRateLimitStore('rl:magic:'),
  keyGenerator: (req: Request): string => {
    const email = req.body?.email
      ? String(req.body.email).toLowerCase().trim()
      : req.ip || 'unknown'
    return `magic-link:${email}`
  },
  message: {
    success: false,
    message:
      'Too many login attempts for this email. Please try again after 15 minutes.',
  },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  validate: {
    keyGeneratorIpFallback: false,
  },
})

export const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes window
  limit: 5, // Allow up to 5 login attempts per IP per 5 minutes
  store: createRateLimitStore('rl:login:'),
  message: {
    success: false,
    message: 'Too many login attempts. Try again later after 5 minutes.',
  },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

export const securityMiddleware = (app: Application): void => {
  // Global Rate Limiting
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes window
      limit: 600, // Limit each IP to 600 requests per window (~40 req/min)
      store: createRateLimitStore('rl:global:'),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  )

  // Helmet setup: Secure HTTP headers
  app.use(helmet())

  // CORS setup: allow origins listed in config.server.corsOrigins
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server calls)
        if (!origin) return callback(null, true)

        const normalizedOrigin = origin.replace(/\/$/, '')

        if (config.server.corsOrigins.includes(normalizedOrigin)) {
          return callback(null, true)
        }

        // Allow localhost/127.0.0.1 origins in development
        if (
          config.server.nodeEnv !== 'production' ||
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ) {
          return callback(null, true)
        }

        return callback(null, false)
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
      exposedHeaders: ['Set-Cookie'],
    }),
  )
}
