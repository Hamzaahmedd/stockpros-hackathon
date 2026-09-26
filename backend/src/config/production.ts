export const productionConfig = {
  env: 'production' as const,
  server: {
    port: 8081,
    logLevel: 'info' as const,
    trustProxy: true,
  },
  auth: {
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '30d',
    magicLinkExpiryMinutes: 10,
  },
  redis: {
    tlsRejectUnauthorized: true,
  },
  cache: {
    enabled: true,
    ttlMultiplier: 1.0,
  },
  ml: {
    internalUrl: 'https://ai-service-oylj.onrender.com',
  },
  smtp: {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
  },
  brand: {
    logoUrl:
      'https://weyddqoxrfdtgmbcnzew.supabase.co/storage/v1/object/public/public-assets/stockpros-logo.png',
  },
  email: {
    useSmtp: false,
    useResend: true,
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
    enableSwaggerDocs: false,
    enablePhoneVerification: true,
    pricingTiersEnabled: false,
    enablePaymentProcessor: false,
  },
  sendpk: {
    mockProvider: false,
    baseUrl: 'https://wa.sendpk.com/api/send.php',
  },
  safepay: {
    mockProvider: false,
    environment: 'production' as const,
    // Fixed, not env-sourced: previously this fell back to the SANDBOX host
    // whenever SAFEPAY_BASE_URL was unset, which would have silently sent
    // production traffic to the sandbox API. Matches Safepay's own SDK
    // constant API_URL_PRODUCTION.
    baseUrl: 'https://api.getsafepay.com',
    // Note: production checkout is on a different host to the API
    // (getsafepay.com, not api.getsafepay.com) — matches Safepay's own SDK
    // constants (CHECKOUT_PRODUCTION vs API_URL_PRODUCTION).
    checkoutBaseUrl: 'https://getsafepay.com/checkout/pay',
  },
  audit: {
    retentionDays: 30,
  },
  notifications: {
    retentionDays: 30,
  },
}
