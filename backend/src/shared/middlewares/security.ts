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

/**
 * Best-effort normalization used only to key the phone-OTP request limiter —
 * not the source of truth for canonical storage (that lives in
 * `normalizePakistaniNumber` inside the auth module). Kept self-contained
 * here so shared middleware doesn't reach into a business module;
 * malformed input simply falls through to the raw/IP-based key below,
 * since the real validation happens at the service layer regardless.
 */
function approximateNormalizedPhoneKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const digits = raw
    .trim()
    .replace(/[\s\-()]/g, '')
    .replace(/^\+/, '')
  if (!/^\d{10,12}$/.test(digits)) return null
  if (/^0\d{10}$/.test(digits)) return `92${digits.slice(1)}`
  return digits
}

// Rate limiter for WhatsApp OTP requests — keyed by normalized phone number,
// on top of (not instead of) the 60s per-user cooldown enforced in
// requestOtp itself.
export const phoneOtpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  limit: 3, // Allow up to 3 OTP requests per phone number per 15 minutes
  store: createRateLimitStore('rl:phone-otp-request:'),
  keyGenerator: (req: Request): string => {
    const normalized = approximateNormalizedPhoneKey(req.body?.phoneNumber)
    return `phone-otp-request:${normalized || req.ip || 'unknown'}`
  },
  message: {
    success: false,
    message:
      'Too many verification code requests for this phone number. Please try again after 15 minutes.',
  },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  validate: {
    keyGeneratorIpFallback: false,
  },
})

// Rate limiter for WhatsApp OTP verification attempts — keyed by IP+userId,
// on top of the per-row `attempts` cap enforced in verifyOtp itself.
export const phoneOtpVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes window
  limit: 5, // Allow up to 5 verify attempts per IP+user per 5 minutes
  store: createRateLimitStore('rl:phone-otp-verify:'),
  keyGenerator: (req: Request): string => {
    const userId = (req as { user?: { userId?: string } }).user?.userId
    return `phone-otp-verify:${req.ip || 'unknown'}:${userId || 'unknown'}`
  },
  message: {
    success: false,
    message: 'Too many verification attempts. Try again later after 5 minutes.',
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
