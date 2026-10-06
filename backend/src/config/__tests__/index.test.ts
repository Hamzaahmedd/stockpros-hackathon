import { developmentConfig } from '../development'
import { productionConfig } from '../production'
import { testConfig } from '../test'
import { buildConfig, parseBooleanEnv, readSecrets } from '../index'

describe('readSecrets', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  const ENV_VARS = [
    'DATABASE_URL',
    'REDIS_URL',
    'ACCESS_TOKEN_SECRET',
    'REFRESH_TOKEN_SECRET',
    'GOOGLE_CLIENT_ID',
    'SMTP_USER',
    'SMTP_PASS',
    'RESEND_API_KEY',
    'FINNHUB_API_KEY',
    'FMP_API_KEY',
    'POLYGON_API_KEY',
    'TWELVE_DATA_API_KEY',
    'AXIOM_TOKEN',
    'POSTHOG_API_KEY',
    'GROQ_API_KEY',
    'CORS_ORIGINS',
    'API_PUBLIC_URL',
    'SENDPK_API_KEY',
    'SENDPK_TEMPLATE_ID',
    'SAFEPAY_API_KEY',
    'SAFEPAY_SECRET_KEY',
    'SAFEPAY_WEBHOOK_SECRET',
    'SAFEPAY_PRO_PLAN_ID',
  ]

  it('reads every secret from its corresponding env var', () => {
    for (const key of ENV_VARS) process.env[key] = `value-${key}`

    const secrets = readSecrets()

    expect(secrets.databaseUrl).toBe('value-DATABASE_URL')
    expect(secrets.safepayWebhookSecret).toBe('value-SAFEPAY_WEBHOOK_SECRET')
    expect(Object.values(secrets)).not.toContain('')
  })

  it('defaults every secret to an empty string when its env var is unset', () => {
    for (const key of ENV_VARS) delete process.env[key]

    const secrets = readSecrets()

    expect(Object.values(secrets).every((v) => v === '')).toBe(true)
  })
})

describe('module load — resolveEnv / loadEnvConfig (via the assembled config)', () => {
  const originalNodeEnv = process.env.NODE_ENV

  const loadWithNodeEnv = (nodeEnv: string | undefined) => {
    jest.resetModules()
    if (nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = nodeEnv
    return jest.requireActual('../index') as typeof import('../index')
  }

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    jest.resetModules()
  })

  it.each([
    ['production', 'production'],
    ['prod', 'production'],
    ['PROD', 'production'],
    ['test', 'test'],
    ['development', 'development'],
    ['dev', 'development'],
  ])('resolves NODE_ENV=%s to the %s env config', (raw, expected) => {
    const { config } = loadWithNodeEnv(raw)
    expect(config.server.nodeEnv).toBe(expected)
  })

  it('defaults to development when NODE_ENV is unset', () => {
    const { config } = loadWithNodeEnv(undefined)
    expect(config.server.nodeEnv).toBe('development')
  })

  it('throws for an unrecognized NODE_ENV value', () => {
    expect(() => loadWithNodeEnv('staging')).toThrow(
      'Invalid NODE_ENV "staging"',
    )
  })
})

describe('buildConfig', () => {
  const baseSecrets = readSecrets()

  describe('apiPublicUrl', () => {
    it('trims a trailing slash from API_PUBLIC_URL', () => {
      const config = buildConfig(developmentConfig, {
        ...baseSecrets,
        apiPublicUrl: 'https://api.example.com/',
      })
      expect(config.server.apiPublicUrl).toBe('https://api.example.com')
    })

    it('defaults to localhost on the server port outside production', () => {
      const config = buildConfig(developmentConfig, {
        ...baseSecrets,
        apiPublicUrl: '',
      })
      expect(config.server.apiPublicUrl).toBe(
        `http://localhost:${config.server.port}`,
      )
    })

    it('is empty in production when unset and SSO is off', () => {
      const config = buildConfig(productionConfig, {
        ...baseSecrets,
        apiPublicUrl: '',
      })
      expect(config.server.apiPublicUrl).toBe('')
    })

    it('is required in production once SSO is enabled', () => {
      const withSso = {
        ...productionConfig,
        features: { ...productionConfig.features, enableSso: true },
      }
      expect(() =>
        buildConfig(withSso, { ...baseSecrets, apiPublicUrl: '' }),
      ).toThrow('API_PUBLIC_URL is required')
      expect(
        buildConfig(withSso, {
          ...baseSecrets,
          apiPublicUrl: 'https://api.example.com',
        }).server.apiPublicUrl,
      ).toBe('https://api.example.com')
    })
  })

  it('parses comma-separated CORS_ORIGINS, trimming whitespace and trailing slashes', () => {
    const config = buildConfig(developmentConfig, {
      ...baseSecrets,
      corsOrigins: ' https://a.example/ , https://b.example ,,',
    })
    expect(config.server.corsOrigins).toEqual([
      'https://a.example',
      'https://b.example',
    ])
  })

  it('defaults to localhost origins in development when none are configured', () => {
    const config = buildConfig(developmentConfig, {
      ...baseSecrets,
      corsOrigins: '',
    })
    expect(config.server.corsOrigins).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ])
  })

  it('defaults to no CORS origins outside development when none are configured', () => {
    const config = buildConfig(productionConfig, {
      ...baseSecrets,
      corsOrigins: '',
    })
    expect(config.server.corsOrigins).toEqual([])
  })

  it("uses the first CORS origin as the frontend URL, falling back to localhost:5173 when there isn't one", () => {
    const withOrigins = buildConfig(developmentConfig, {
      ...baseSecrets,
      corsOrigins: 'https://app.example',
    })
    expect(withOrigins.server.frontendUrl).toBe('https://app.example')

    const withoutOrigins = buildConfig(productionConfig, {
      ...baseSecrets,
      corsOrigins: '',
    })
    expect(withoutOrigins.server.frontendUrl).toBe('http://localhost:5173')
  })
})

describe('parseBooleanEnv', () => {
  it.each([undefined, '', '  ', 'false', 'FALSE', '0', ' False '])(
    'treats %j as false',
    (raw) => {
      expect(parseBooleanEnv('FLAG', raw)).toBe(false)
    },
  )

  it.each(['true', 'TRUE', '1', ' True '])('treats %j as true', (raw) => {
    expect(parseBooleanEnv('FLAG', raw)).toBe(true)
  })

  it.each(['yes', 'on', '2', 'tru', 'enabled'])(
    'throws for %j instead of silently reading it as false',
    (raw) => {
      expect(() => parseBooleanEnv('FLAG', raw)).toThrow(
        `Invalid FLAG "${raw}". Expected true, false, 1 or 0.`,
      )
    },
  )
})

describe('buildConfig — market.emergencyClosed', () => {
  const original = process.env.EMERGENCY_MARKET_CLOSED
  const secrets = readSecrets()

  afterEach(() => {
    if (original === undefined) delete process.env.EMERGENCY_MARKET_CLOSED
    else process.env.EMERGENCY_MARKET_CLOSED = original
  })

  it('defaults to false when EMERGENCY_MARKET_CLOSED is unset', () => {
    delete process.env.EMERGENCY_MARKET_CLOSED
    expect(buildConfig(developmentConfig, secrets).market.emergencyClosed).toBe(
      false,
    )
  })

  it('reads EMERGENCY_MARKET_CLOSED=true', () => {
    process.env.EMERGENCY_MARKET_CLOSED = 'true'
    expect(buildConfig(productionConfig, secrets).market.emergencyClosed).toBe(
      true,
    )
  })

  it('fails startup on an unrecognised value', () => {
    process.env.EMERGENCY_MARKET_CLOSED = 'yes'
    expect(() => buildConfig(developmentConfig, secrets)).toThrow(
      'Invalid EMERGENCY_MARKET_CLOSED "yes"',
    )
  })
})

describe('priorityQueue limits', () => {
  // The frontend client timeout (frontend/src/shared/api/timeouts.ts) is 40 s:
  // this 20 s queue wait + 20 s of compute headroom. Change them together.
  it.each([
    ['development', developmentConfig],
    ['production', productionConfig],
    ['test', testConfig],
  ])('%s config caps the queue wait at 20 s', (_env, envConfig) => {
    expect(envConfig.priorityQueue.maxWaitMs).toBe(20_000)
  })

  it.each([
    ['development', developmentConfig],
    ['production', productionConfig],
    ['test', testConfig],
  ])('%s config has sane concurrency and depth', (_env, envConfig) => {
    expect(envConfig.priorityQueue.concurrency).toBeGreaterThan(0)
    expect(envConfig.priorityQueue.maxQueueDepth).toBeGreaterThan(0)
  })

  it('is exposed on the assembled config', () => {
    const built = buildConfig(developmentConfig, readSecrets())
    expect(built.priorityQueue).toEqual(developmentConfig.priorityQueue)
  })
})
