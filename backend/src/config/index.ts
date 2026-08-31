// Environment configuration loader: resolves NODE_ENV, merges the matching
// environment config with secrets read from the environment, validates,
// and exports the unified runtime config.
import { developmentConfig } from './development'
import { productionConfig } from './production'
import { testConfig } from './test'

/** Non-sensitive, environment-specific settings defined per config file. */
export type EnvConfig = typeof developmentConfig | typeof productionConfig | typeof testConfig

/** Sensitive values sourced exclusively from the process environment. */
export const readSecrets = (): {
  databaseUrl: string
  redisUrl: string
  accessTokenSecret: string
  refreshTokenSecret: string
  googleClientId: string
  smtpUser: string
  smtpPass: string
  resendApiKey: string
  finnhubApiKey: string
  fmpApiKey: string
  polygonApiKey: string
  twelveDataApiKey: string
} => ({
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET || '',
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  finnhubApiKey: process.env.FINNHUB_API_KEY || '',
  fmpApiKey: process.env.FMP_API_KEY || '',
  polygonApiKey: process.env.POLYGON_API_KEY || '',
  twelveDataApiKey: process.env.TWELVE_DATA_API_KEY || '',
})

export type Secrets = ReturnType<typeof readSecrets>
export type Environment = 'development' | 'test' | 'production'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const resolveEnv = (): Environment => {
  const raw = (process.env.NODE_ENV || 'development').trim().toLowerCase()
  if (raw === 'prod' || raw === 'production') return 'production'
  if (raw === 'test') return 'test'
  if (raw === 'dev' || raw === 'development') return 'development'
  throw new Error(
    `Invalid NODE_ENV "${process.env.NODE_ENV}". Expected one of: development, test, production.`,
  )
}

const loadEnvConfig = (env: Environment): EnvConfig => {
  switch (env) {
    case 'production':
      return productionConfig
    case 'test':
      return testConfig
    case 'development':
      return developmentConfig
  }
}

/** Unified runtime configuration consumed across the app. */
export const buildConfig = (
  env: EnvConfig,
  secrets: Secrets,
): {
  server: {
    port: number
    nodeEnv: Environment
    logLevel: LogLevel
    trustProxy: boolean
    frontendUrl: string
  }
  database: {
    url: string
  }
  auth: {
    accessTokenSecret: string
    accessTokenExpiry: string
    refreshTokenSecret: string
    refreshTokenExpiry: string
    magicLinkExpiryMinutes: number
    googleClientId: string
  }
  redis: {
    url: string
    tlsRejectUnauthorized: boolean
  }
  cache: {
    enabled: boolean
    ttlMultiplier: number
  }
  ml: {
    internalUrl: string
  }
  finnhub: {
    apiKey: string
    quoteTTL: number
  }
  smtp: {
    host: string
    port: number
    user: string
    pass: string
  }
  brand: {
    logoUrl: string
  }
  email: {
    resendApiKey: string
    useSmtp: boolean
    useResend: boolean
    resendFrom: string
  }
  fmp: {
    apiKey: string
  }
  polygon: {
    apiKey: string
  }
  twelveData: {
    apiKey: string
  }
  features: {
    enableNewsCron: boolean
    enableWatchlistCron: boolean
    enableAiRecomputeCron: boolean
    enableSwaggerDocs: boolean
  }
} => ({
  server: {
    // PORT may be injected at runtime by the PaaS.
    port: Number(process.env.PORT) || env.server.port,
    nodeEnv: env.env,
    logLevel: env.server.logLevel,
    trustProxy: env.server.trustProxy,
    frontendUrl: env.server.frontendUrl.endsWith('/')
      ? env.server.frontendUrl.slice(0, -1)
      : env.server.frontendUrl,
  },
  database: {
    url: secrets.databaseUrl,
  },
  auth: {
    accessTokenSecret: secrets.accessTokenSecret,
    accessTokenExpiry: env.auth.accessTokenExpiry,
    refreshTokenSecret: secrets.refreshTokenSecret,
    refreshTokenExpiry: env.auth.refreshTokenExpiry,
    magicLinkExpiryMinutes: env.auth.magicLinkExpiryMinutes,
    googleClientId: secrets.googleClientId,
  },
  redis: {
    url: secrets.redisUrl,
    tlsRejectUnauthorized: env.redis.tlsRejectUnauthorized,
  },
  cache: {
    enabled: env.cache.enabled,
    ttlMultiplier: env.cache.ttlMultiplier,
  },
  ml: {
    internalUrl: env.ml.internalUrl,
  },
  finnhub: {
    apiKey: secrets.finnhubApiKey,
    quoteTTL: env.finnhub.quoteTTL,
  },
  smtp: {
    host: env.smtp.host,
    port: env.smtp.port,
    user: secrets.smtpUser,
    pass: secrets.smtpPass
  },
  brand: {
    logoUrl: env.brand.logoUrl,
  },
  email: {
    resendApiKey: secrets.resendApiKey,
    useSmtp: env.email.useSmtp,
    useResend: env.email.useResend,
    resendFrom: env.email.resendFrom,
  },
  fmp: {
    apiKey: secrets.fmpApiKey,
  },
  polygon: {
    apiKey: secrets.polygonApiKey,
  },
  twelveData: {
    apiKey: secrets.twelveDataApiKey,
  },
  features: env.features,
})

export type AppConfig = ReturnType<typeof buildConfig>

// Secrets required to boot: [env label, Secrets key].
const REQUIRED_SECRETS: ReadonlyArray<readonly [label: string, key: keyof Secrets]> = [
  ['DATABASE_URL', 'databaseUrl'],
  ['ACCESS_TOKEN_SECRET', 'accessTokenSecret'],
  ['REFRESH_TOKEN_SECRET', 'refreshTokenSecret'],
]

const validateConfig = (config: AppConfig, secrets: Secrets, env: 'development' | 'test' | 'production'): void => {
  if (env === 'test') return

  const missing = REQUIRED_SECRETS.filter(([, key]) => !secrets[key]).map(([label]) => label)
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment secret(s): ${missing.join(', ')}. ` +
        `These must be provided via .env (never committed).`,
    )
  }

  if (!config.database.url) {
    throw new Error('Invalid configuration: database.url resolved to an empty value.')
  }
  if (!Number.isFinite(config.server.port) || config.server.port <= 0) {
    throw new Error(
      `Invalid configuration: server.port must be a positive number (got ${config.server.port}).`,
    )
  }
}

const activeEnv = resolveEnv()
const secrets = readSecrets()
const assembled = buildConfig(loadEnvConfig(activeEnv), secrets)
validateConfig(assembled, secrets, activeEnv)

export const config: AppConfig = assembled
export default config
