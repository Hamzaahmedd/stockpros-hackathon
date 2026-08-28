// Environment configuration loader: resolves NODE_ENV, merges the matching
// EnvConfig with secrets read from the environment, validates, and exports AppConfig.
import { developmentConfig } from './development'
import { productionConfig } from './production'
import { testConfig } from './test'
import type { AppConfig, EnvConfig, NodeEnv, Secrets } from './types'

const resolveEnv = (): NodeEnv => {
  const raw = (process.env.NODE_ENV || 'development').trim().toLowerCase()
  if (raw === 'prod' || raw === 'production') return 'production'
  if (raw === 'test') return 'test'
  if (raw === 'dev' || raw === 'development') return 'development'
  throw new Error(
    `Invalid NODE_ENV "${process.env.NODE_ENV}". Expected one of: development, test, production.`,
  )
}

const loadEnvConfig = (env: NodeEnv): EnvConfig => {
  switch (env) {
    case 'production':
      return productionConfig
    case 'test':
      return testConfig
    case 'development':
      return developmentConfig
  }
}

const readSecrets = (): Secrets => ({
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  redisCaCert: process.env.REDIS_CA_CERT || '',
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

const buildConfig = (env: EnvConfig, secrets: Secrets): AppConfig => ({
  server: {
    // PORT may be injected at runtime by the PaaS.
    port: Number(process.env.PORT) || env.server.port,
    nodeEnv: env.env,
    logLevel: env.server.logLevel,
    trustProxy: env.server.trustProxy,
    frontendUrl: env.server.frontendUrl.replace(/\/+$/, ''),
  },
  database: {
    url: secrets.databaseUrl,
  },
  auth: {
    accessTokenSecret: secrets.accessTokenSecret,
    accessTokenExpiry: env.auth.accessTokenExpiry,
    refreshTokenSecret: secrets.refreshTokenSecret,
    refreshTokenExpiry: env.auth.refreshTokenExpiry,
    saltRounds: env.auth.saltRounds,
    magicLinkExpiryMinutes: env.auth.magicLinkExpiryMinutes,
    googleClientId: secrets.googleClientId,
  },
  redis: {
    url: secrets.redisUrl,
    caCert: secrets.redisCaCert,
    tlsRejectUnauthorized: env.redis.tlsRejectUnauthorized,
  },
  cache: {
    quoteTtlSeconds: env.cache.quoteTtlSeconds,
    responseTtlSeconds: env.cache.responseTtlSeconds,
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
    pass: secrets.smtpPass,
    otpTTL: env.smtp.otpTTL,
  },
  email: {
    resendApiKey: secrets.resendApiKey,
    resendFrom: env.email.resendFrom,
    fromAddress: env.email.fromAddress || secrets.smtpUser,
    logoUrl: env.email.logoUrl,
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

// Secrets required to boot: [env label, Secrets key].
const REQUIRED_SECRETS: ReadonlyArray<
  readonly [label: string, key: keyof Secrets]
> = [
  ['DATABASE_URL', 'databaseUrl'],
  ['ACCESS_TOKEN_SECRET', 'accessTokenSecret'],
  ['REFRESH_TOKEN_SECRET', 'refreshTokenSecret'],
]

const validateConfig = (
  config: AppConfig,
  secrets: Secrets,
  env: NodeEnv,
): void => {
  if (env === 'test') return

  const missing = REQUIRED_SECRETS.filter(([, key]) => !secrets[key]).map(
    ([label]) => label,
  )
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment secret(s): ${missing.join(', ')}. ` +
        `These must be provided via .env (never committed).`,
    )
  }

  if (!config.database.url) {
    throw new Error(
      'Invalid configuration: database.url resolved to an empty value.',
    )
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
