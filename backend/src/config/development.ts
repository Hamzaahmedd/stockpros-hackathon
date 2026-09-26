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
  posthog: {
    host: 'https://us.i.posthog.com',
  },
  groq: {
    model: 'openai/gpt-oss-20b',
  },
  features: {
    enableNewsCron: true,
    enableWatchlistCron: true,
    enableAiRecomputeCron: true,
    enableSwaggerDocs: true,
    enablePhoneVerification: false,
    pricingTiersEnabled: false,
    enablePaymentProcessor: false,
  },
  sendpk: {
    // Explicit, visible flag rather than inferring mock mode from a missing
    // API key — mock behavior is never accidental here.
    mockProvider: true,
    baseUrl: 'https://wa.sendpk.com/api/send.php',
  },
  safepay: {
    mockProvider: true,
    // Sandbox and dev share the same host/checkout base per Safepay's own
    // SDK constants (API_URL_SANDBOX === API_URL_DEVELOPMENT's host shape).
    environment: 'sandbox' as const,
    baseUrl: 'https://sandbox.api.getsafepay.com',
    checkoutBaseUrl: 'https://sandbox.api.getsafepay.com/checkout/pay',
  },
  audit: {
    retentionDays: 30,
  },
  notifications: {
    retentionDays: 30,
  },
}
