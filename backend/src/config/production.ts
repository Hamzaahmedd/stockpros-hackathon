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
    sessionMaxAgeHours: 12,
    // Sensitive admin writes need a recent emailed-code re-verification.
    stepUpEnabled: true,
    // How long one verification covers; each successful write extends it.
    stepUpWindowMinutes: 15,
    // Hide customer email/name in staff views until a reveal is requested (audited).
    maskCustomerPii: true,
    // Every admin write must cite a support ticket (format-validated whenever supplied).
    requireTicketRef: true,
  },
  audit: {
    retentionDays: 30,
  },
  notifications: {
    retentionDays: 30,
  },
}
