import { developmentConfig } from './development'
import { productionConfig } from './production'
import { testConfig } from './test'

export type EnvConfig =
  typeof developmentConfig | typeof productionConfig | typeof testConfig

export const readSecrets = () => ({
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
  axiomToken: process.env.AXIOM_TOKEN || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b',
  corsOrigins: process.env.CORS_ORIGINS || '',
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

export const buildConfig = (env: EnvConfig, secrets: Secrets) => {
  // Parse comma-separated origins exclusively from process.env.CORS_ORIGINS
  const corsOrigins = secrets.corsOrigins
    ? secrets.corsOrigins
        .split(',')
        .map((origin) => origin.trim().replace(/\/$/, ''))
        .filter(Boolean)
    : env.env === 'development'
      ? ['http://localhost:5173', 'http://127.0.0.1:5173']
      : []

  const frontendUrl = corsOrigins[0] || 'http://localhost:5173'

  return {
    server: {
      port: Number(process.env.PORT) || env.server.port,
      nodeEnv: env.env,
      logLevel: env.server.logLevel,
      trustProxy: env.server.trustProxy,
      corsOrigins,
      frontendUrl,
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
    },
    smtp: {
      host: env.smtp.host,
      port: env.smtp.port,
      user: secrets.smtpUser,
      pass: secrets.smtpPass,
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
    axiom: {
      token: secrets.axiomToken,
      dataset: env.axiom.dataset,
    },
    groq: {
      apiKey: secrets.groqApiKey,
      model: secrets.groqModel,
    },
    features: env.features,
    audit: {
      enabled: true,
      retentionDays: env.audit.retentionDays,
    },
  }
}

export type AppConfig = ReturnType<typeof buildConfig>

const activeEnv = resolveEnv()
const secrets = readSecrets()
const assembled = buildConfig(loadEnvConfig(activeEnv), secrets)

export const config: AppConfig = assembled
export default config
