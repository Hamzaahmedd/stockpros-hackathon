import config from '@/config'
import cors from 'cors'
import { Application, Request } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'

// Rate limiter for passwordless magic link requests — keyed by EMAIL address
export const emailMagicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  limit: 5, // Allow up to 5 login attempts per SAME email per 15 minutes
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
  validate: false,
})

export const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes window
  limit: 5, // Allow up to 5 login attempts per IP per 5 minutes
  message: {
    success: false,
    message: 'Too many login attempts. Try again later after 5 minutes.',
  },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  validate: false,
})

export const OTPLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5, // Allow up to 5 OTP requests per email/IP
  keyGenerator: (req: Request): string => {
    const email = req.body?.email
      ? String(req.body.email).toLowerCase().trim()
      : req.ip || 'unknown'
    return `otp:${email}`
  },
  message: {
    success: false,
    message: 'Too many requests. Please try again in 15 minutes.',
  },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  validate: false,
})

export const securityMiddleware = (app: Application): void => {
  // Global Rate Limiting
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes window
      limit: 600, // Limit each IP to 600 requests per window (~40 req/min)
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      validate: false,
    }),
  )

  // Helmet setup: Secure HTTP headers
  app.use(helmet())

  // CORS setup: allow the single configured frontend origin.
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true)

        if (config.server.frontendUrl === origin) {
          return callback(null, true)
        }

        // Development keeps local browser testing convenient.
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
