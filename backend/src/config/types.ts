// Configuration type contracts.
// EnvConfig holds non-sensitive, per-environment settings (development/test/production.ts);
// Secrets holds values read from the environment; AppConfig is the merged runtime object.

export type NodeEnv = 'development' | 'test' | 'production'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Non-sensitive, environment-specific settings defined per config file. */
export interface EnvConfig {
  env: NodeEnv
  server: {
    port: number
    logLevel: LogLevel
    trustProxy: boolean
    frontendUrl: string
  }
  auth: {
    accessTokenExpiry: string
    refreshTokenExpiry: string
    saltRounds: number
    magicLinkExpiryMinutes: number
  }
  redis: {
    tlsRejectUnauthorized: boolean
  }
  cache: {
    quoteTtlSeconds: number
    responseTtlSeconds: number
  }
  ml: {
    internalUrl: string
  }
  finnhub: {
    quoteTTL: number
  }
  smtp: {
    host: string
    port: number
    otpTTL: number
  }
  email: {
    resendFrom: string
    fromAddress: string
    logoUrl: string
  }
  features: {
    enableNewsCron: boolean
    enableWatchlistCron: boolean
    enableAiRecomputeCron: boolean
  }
}

/** Sensitive values sourced exclusively from the process environment. */
export interface Secrets {
  databaseUrl: string
  redisUrl: string
  redisCaCert: string
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
}

/** Unified runtime configuration consumed across the app. */
export interface AppConfig {
  server: {
    port: number
    nodeEnv: NodeEnv
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
    saltRounds: number
    magicLinkExpiryMinutes: number
    googleClientId: string
  }
  redis: {
    url: string
    caCert: string
    tlsRejectUnauthorized: boolean
  }
  cache: {
    quoteTtlSeconds: number
    responseTtlSeconds: number
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
    otpTTL: number
  }
  email: {
    resendApiKey: string
    resendFrom: string
    fromAddress: string
    logoUrl: string
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
  }
}
