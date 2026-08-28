// Non-sensitive settings for the automated test suite.
import type { EnvConfig } from './types'

export const testConfig: EnvConfig = {
  env: 'test',
  server: {
    port: 0,
    logLevel: 'error',
    trustProxy: false,
    frontendUrl: 'http://localhost:5173',
  },
  auth: {
    accessTokenExpiry: '1h',
    refreshTokenExpiry: '1h',
    saltRounds: 4,
    magicLinkExpiryMinutes: 10,
  },
  redis: {
    tlsRejectUnauthorized: false,
  },
  cache: {
    quoteTtlSeconds: 1,
    responseTtlSeconds: 1,
  },
  ml: {
    internalUrl: 'http://localhost:8000',
  },
  finnhub: {
    quoteTTL: 1,
  },
  smtp: {
    host: 'localhost',
    port: 1025,
    otpTTL: 30,
  },
  email: {
    resendFrom: 'StockPros Test <test@example.com>',
    fromAddress: 'test@example.com',
    logoUrl: '',
  },
  features: {
    enableNewsCron: false,
    enableWatchlistCron: false,
    enableAiRecomputeCron: false,
  },
}
