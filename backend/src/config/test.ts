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
  posthog: {
    host: 'https://us.i.posthog.com',
  },
  groq: {
    model: 'openai/gpt-oss-20b',
  },
  priorityQueue: {
    // Max compute-heavy requests (forecast / market decision) running at once per process.
    concurrency: 8,
    // Requests allowed to wait; beyond this new ones are shed with a 503.
    maxQueueDepth: 200,
    // Longest a request may wait for a slot before being shed with a 503.
    maxWaitMs: 20_000,
  },
  features: {
    enableNewsCron: false,
    enableWatchlistCron: false,
    enableAiRecomputeCron: false,
    enableSubscriptionCron: false,
    enableSwaggerDocs: false,
    enablePhoneVerification: false,
    pricingTiersEnabled: false,
    enablePaymentProcessor: false,
  },
  sendpk: {
    mockProvider: true,
    baseUrl: 'https://wa.sendpk.com/api/send.php',
  },
  safepay: {
    mockProvider: true,
    environment: 'sandbox' as const,
    baseUrl: 'https://sandbox.api.getsafepay.com',
    checkoutBaseUrl: 'https://sandbox.api.getsafepay.com/checkout/pay',
  },
  // Internal staff ops panel (/api/v1/admin) hardening switches.
  admin: {
    // Sensitive admin writes need a recent emailed-code re-verification.
    stepUpEnabled: false,
    // How long one verification covers; each successful write extends it.
    stepUpWindowMinutes: 15,
    // Hide customer email/name in staff views until a reveal is requested (audited).
    maskCustomerPii: false,
    // Every admin write must cite a support ticket (format-validated whenever supplied).
    requireTicketRef: false,
  },
  audit: {
    retentionDays: 30,
  },
  notifications: {
    retentionDays: 30,
  },
}
