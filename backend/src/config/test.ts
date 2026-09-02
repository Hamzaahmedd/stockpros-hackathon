// Non-sensitive settings for the automated test suite.

export const testConfig = {
  env: 'test' as const,
  server: {
    port: 0,
    logLevel: 'error' as const,
    trustProxy: false,
    frontendUrl: 'http://localhost:5173',
  },
  auth: {
    accessTokenExpiry: '1h',
    refreshTokenExpiry: '1h',
    magicLinkExpiryMinutes: 10,
  },
  redis: {
    tlsRejectUnauthorized: false,
  },
  cache: {
    enabled: false,
    ttlMultiplier: 0,
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
  },
  brand: {
    logoUrl: '',
  },
  email: {
    useSmtp: true,
    useResend: true,
    resendFrom: 'StockPros Test <test@example.com>',
  },
  features: {
    enableNewsCron: false,
    enableWatchlistCron: false,
    enableAiRecomputeCron: false,
    enableSwaggerDocs: false,
  },
  audit: {
    retentionDays: 30, 
  },
}
