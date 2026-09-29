/**
 * security.ts constructs its rate limiters (and picks Redis vs in-memory
 * storage) at MODULE LOAD TIME, not per-request — so exercising both branches
 * of that choice means re-importing the module fresh, with a differently
 * mocked `getRawRedisClient` each time. `jest.doMock` + `jest.resetModules`
 * inside each test (rather than static top-level `jest.mock`) is what makes
 * that possible.
 */

const mockRateLimitDeps = (
  redisClient: unknown,
  configOverrides: { nodeEnv?: string; corsOrigins?: string[] } = {},
) => {
  // `jest.resetModules()` purges the module registry, which means a
  // top-level `import config from '@/config'` captured before reset points
  // at a now-orphaned instance — mutating it has no effect on what a freshly
  // `require`d security.ts actually reads. Mocking `@/config` per test (with
  // the exact fields security.ts reads) avoids that trap entirely.
  jest.doMock('@/config', () => ({
    __esModule: true,
    default: {
      server: {
        nodeEnv: configOverrides.nodeEnv ?? 'test',
        corsOrigins: configOverrides.corsOrigins ?? [],
      },
    },
  }))
  jest.doMock('../../infrastructure/cache', () => ({
    getRawRedisClient: jest.fn().mockReturnValue(redisClient),
  }))
  jest.doMock('../../infrastructure/redis-sliding-window-store', () => ({
    RedisSlidingWindowStore: jest
      .fn()
      .mockImplementation((opts) => ({ __kind: 'redis', ...opts })),
  }))
  jest.doMock('express-rate-limit', () => ({
    __esModule: true,
    default: jest.fn((opts: unknown) => opts),
    MemoryStore: jest.fn().mockImplementation(() => ({ __kind: 'memory' })),
  }))
  jest.doMock('cors', () => ({
    __esModule: true,
    default: jest.fn((opts: unknown) => ({ __kind: 'cors', opts })),
  }))
  jest.doMock('helmet', () => ({
    __esModule: true,
    default: jest.fn(() => ({ __kind: 'helmet' })),
  }))
}

beforeEach(() => {
  jest.resetModules()
})

describe('rate limiter store selection', () => {
  it('backs every limiter with RedisSlidingWindowStore when a Redis client is available at load time', () => {
    mockRateLimitDeps({ id: 'fake-redis-client' })
    const security = require('../security')

    expect(security.emailMagicLinkLimiter.store).toMatchObject({
      __kind: 'redis',
      prefix: 'rl:magic:',
    })
    expect(security.loginLimiter.store).toMatchObject({
      __kind: 'redis',
      prefix: 'rl:login:',
    })
    expect(security.phoneOtpRequestLimiter.store).toMatchObject({
      __kind: 'redis',
      prefix: 'rl:phone-otp-request:',
    })
    expect(security.phoneOtpVerifyLimiter.store).toMatchObject({
      __kind: 'redis',
      prefix: 'rl:phone-otp-verify:',
    })
  })

  it('falls back to MemoryStore for every limiter when no Redis client is available', () => {
    mockRateLimitDeps(null)
    const security = require('../security')

    expect(security.emailMagicLinkLimiter.store).toEqual({ __kind: 'memory' })
    expect(security.loginLimiter.store).toEqual({ __kind: 'memory' })
  })
})

describe('emailMagicLinkLimiter keyGenerator', () => {
  it('keys by the lowercased, trimmed email address', () => {
    mockRateLimitDeps(null)
    const { emailMagicLinkLimiter } = require('../security')
    const key = emailMagicLinkLimiter.keyGenerator({
      body: { email: '  User@Example.com  ' },
    })
    expect(key).toBe('magic-link:user@example.com')
  })

  it('falls back to the request IP when no email is present', () => {
    mockRateLimitDeps(null)
    const { emailMagicLinkLimiter } = require('../security')
    const key = emailMagicLinkLimiter.keyGenerator({ body: {}, ip: '1.2.3.4' })
    expect(key).toBe('magic-link:1.2.3.4')
  })

  it('falls back to "unknown" when neither email nor IP is present', () => {
    mockRateLimitDeps(null)
    const { emailMagicLinkLimiter } = require('../security')
    const key = emailMagicLinkLimiter.keyGenerator({ body: {} })
    expect(key).toBe('magic-link:unknown')
  })
})

describe('phoneOtpRequestLimiter keyGenerator (approximateNormalizedPhoneKey)', () => {
  const keyFor = (phoneNumber: unknown, ip = '1.2.3.4') => {
    mockRateLimitDeps(null)
    const { phoneOtpRequestLimiter } = require('../security')
    return phoneOtpRequestLimiter.keyGenerator({ body: { phoneNumber }, ip })
  }

  it('rewrites a local 11-digit 0-prefixed number to the 92 country-code form', () => {
    expect(keyFor('03001234567')).toBe('phone-otp-request:923001234567')
  })

  it('strips a leading + and accepts an already-international number as-is', () => {
    expect(keyFor('+923001234567')).toBe('phone-otp-request:923001234567')
  })

  it('strips spaces, hyphens and parentheses before validating', () => {
    expect(keyFor('0300 123-4567')).toBe('phone-otp-request:923001234567')
  })

  it('falls back to the IP for a non-string phone number', () => {
    expect(keyFor(12345678901)).toBe('phone-otp-request:1.2.3.4')
  })

  it('falls back to the IP for a string that is not a plausible phone number', () => {
    expect(keyFor('not-a-phone-number')).toBe('phone-otp-request:1.2.3.4')
  })

  it('falls back to "unknown" when neither a valid phone number nor an IP is present', () => {
    mockRateLimitDeps(null)
    const { phoneOtpRequestLimiter } = require('../security')
    const key = phoneOtpRequestLimiter.keyGenerator({ body: {} })
    expect(key).toBe('phone-otp-request:unknown')
  })
})

describe('phoneOtpVerifyLimiter keyGenerator', () => {
  it('keys by IP and authenticated userId', () => {
    mockRateLimitDeps(null)
    const { phoneOtpVerifyLimiter } = require('../security')
    const key = phoneOtpVerifyLimiter.keyGenerator({
      ip: '1.2.3.4',
      user: { userId: 'user-1' },
    })
    expect(key).toBe('phone-otp-verify:1.2.3.4:user-1')
  })

  it('falls back to "unknown" for a missing IP or userId', () => {
    mockRateLimitDeps(null)
    const { phoneOtpVerifyLimiter } = require('../security')
    const key = phoneOtpVerifyLimiter.keyGenerator({})
    expect(key).toBe('phone-otp-verify:unknown:unknown')
  })
})

describe('securityMiddleware', () => {
  it('registers the global rate limiter, helmet, and cors middleware', () => {
    mockRateLimitDeps(null)
    const { securityMiddleware } = require('../security')
    const app = { use: jest.fn() }

    securityMiddleware(app)
    expect(app.use).toHaveBeenCalledTimes(3)
  })

  const getCorsOriginCallback = (
    configOverrides: {
      nodeEnv?: string
      corsOrigins?: string[]
    } = {},
  ) => {
    mockRateLimitDeps(null, configOverrides)
    const { securityMiddleware } = require('../security')
    const corsMock = require('cors').default as jest.Mock
    const app = { use: jest.fn() }

    securityMiddleware(app)
    const corsCallArgs = corsMock.mock.calls[0][0]
    return corsCallArgs.origin as (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => void
  }

  it('allows requests with no Origin header (mobile apps, curl, server-to-server)', () => {
    const origin = getCorsOriginCallback()
    const cb = jest.fn()
    origin(undefined, cb)
    expect(cb).toHaveBeenCalledWith(null, true)
  })

  it('allows an origin in the configured allow-list, ignoring a trailing slash', () => {
    const origin = getCorsOriginCallback({
      corsOrigins: ['https://app.example.com'],
    })
    const cb = jest.fn()
    origin('https://app.example.com/', cb)
    expect(cb).toHaveBeenCalledWith(null, true)
  })

  it('allows any origin outside production, even if not in the allow-list', () => {
    const origin = getCorsOriginCallback({
      nodeEnv: 'development',
      corsOrigins: [],
    })
    const cb = jest.fn()
    origin('https://not-listed.example.com', cb)
    expect(cb).toHaveBeenCalledWith(null, true)
  })

  it('allows a localhost origin in production (dev tooling against a prod API)', () => {
    const origin = getCorsOriginCallback({
      nodeEnv: 'production',
      corsOrigins: [],
    })
    const cb = jest.fn()
    origin('http://localhost:5173', cb)
    expect(cb).toHaveBeenCalledWith(null, true)
  })

  it('rejects an unlisted, non-localhost origin in production', () => {
    const origin = getCorsOriginCallback({
      nodeEnv: 'production',
      corsOrigins: [],
    })
    const cb = jest.fn()
    origin('https://evil.example.com', cb)
    expect(cb).toHaveBeenCalledWith(null, false)
  })
})
