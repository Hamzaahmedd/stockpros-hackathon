export const developmentConfig = {
  env: 'development' as const,
  server: {
    port: 3000,
    logLevel: 'debug' as const,
    trustProxy: true,
  },
  auth: {
    accessTokenExpiry: '7d',
    refreshTokenExpiry: '7d',
    magicLinkExpiryMinutes: 10,
  },
  redis: {
    tlsRejectUnauthorized: false,
  },
  cache: {
    enabled: true,
    ttlMultiplier: 1.0,
  },
  ml: {
    internalUrl: 'http://localhost:8000',
  },
  smtp: {
    host: 'smtp.zoho.com',
    port: 465,
    secure: true,
  },
  brand: {
    logoUrl:
      'https://weyddqoxrfdtgmbcnzew.supabase.co/storage/v1/object/public/public-assets/stockpros-logo.png',
  },
  email: {
    useSmtp: true,
    useResend: false,
    resendFrom: 'StockPros <support@stockpros.tech>',
  },
  axiom: {
    dataset: 'stockpros-audit-logs',
  },
  features: {
    enableNewsCron: true,
    enableWatchlistCron: true,
    enableAiRecomputeCron: true,
    enableSwaggerDocs: true,
  },
  audit: {
    retentionDays: 30,
  },
}
