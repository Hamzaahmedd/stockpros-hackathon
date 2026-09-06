export const testConfig = {
  env: 'test' as const,
  server: {
    port: 0,
    logLevel: 'error' as const,
    trustProxy: false,
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
  smtp: {
    host: 'localhost',
    port: 1025,
    secure: false,
  },
  brand: {
    logoUrl: '',
  },
  email: {
    useSmtp: true,
    useResend: true,
    resendFrom: 'StockPros Test <test@example.com>',
  },
  axiom: {
    dataset: 'stockpros-audit-logs',
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
