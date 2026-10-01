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
  priorityQueue: {
    // Max compute-heavy requests (forecast / market decision) running at once per process.
    concurrency: 8,
    // Requests allowed to wait; beyond this new ones are shed with a 503.
    maxQueueDepth: 200,
    // Longest a request may wait for a slot before being shed with a 503.
    maxWaitMs: 20_000,
  },
  features: {
    enableNewsCron: true,
    enableWatchlistCron: true,
    enableAiRecomputeCron: true,
    enableSubscriptionCron: true,
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
  // Internal staff ops panel (/api/v1/admin) hardening switches.
  admin: {
    // Security recipients told about risky staff actions (identifiers only). Empty = no alerts.
    alertEmails: [] as string[],
    // Credit adjustments of at least this size (paisa, either direction) also alert.
    alertCreditThresholdPaisa: 5_000_000,
    // Networks (IPs or CIDR ranges, e.g. an office or VPN) the staff panel accepts; empty = any.
    // Requires app.ts `trust proxy` to equal the number of reverse proxies in front of the app.
    ipAllowlist: [] as string[],
    // Absolute staff session lifetime in hours (0 = no limit). Refresh does not extend it.
    sessionMaxAgeHours: 0,
    // Sensitive admin writes need a recent emailed-code re-verification.
    stepUpEnabled: false,
    // How long one verification covers; each successful write extends it.
    stepUpWindowMinutes: 15,
    // Hide customer email/name in staff views until a reveal is requested (audited).
    maskCustomerPii: true,
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
