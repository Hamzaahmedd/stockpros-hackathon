import { developmentConfig } from './development'
import { productionConfig } from './production'
import { testConfig } from './test'

export type EnvConfig =
  typeof developmentConfig | typeof productionConfig | typeof testConfig

export const readSecrets = () => ({
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET || '',
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  finnhubApiKey: process.env.FINNHUB_API_KEY || '',
  fmpApiKey: process.env.FMP_API_KEY || '',
  polygonApiKey: process.env.POLYGON_API_KEY || '',
  twelveDataApiKey: process.env.TWELVE_DATA_API_KEY || '',
  axiomToken: process.env.AXIOM_TOKEN || '',
  posthogApiKey: process.env.POSTHOG_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  corsOrigins: process.env.CORS_ORIGINS || '',
  // Public base URL of this API (not a secret): where IdPs post SAML responses.
  apiPublicUrl: process.env.API_PUBLIC_URL || '',
  sendpkApiKey: process.env.SENDPK_API_KEY || '',
  sendpkTemplateId: process.env.SENDPK_TEMPLATE_ID || '',
  safepayApiKey: process.env.SAFEPAY_API_KEY || '',
  safepaySecretKey: process.env.SAFEPAY_SECRET_KEY || '',
  safepayWebhookSecret: process.env.SAFEPAY_WEBHOOK_SECRET || '',
  // Identifier for the merchant-dashboard-configured recurring "Pro Monthly"
  // Plan (Safepay's Plan-based subscription product has no known create-via-API
  // path — see modules/payments/client.ts's createSubscriptionCheckout) — not a
  // credential, but env-var-driven like the other Safepay identifiers here.
  safepayProPlanId: process.env.SAFEPAY_PRO_PLAN_ID || '',
  // Slack/Discord incoming-webhook URL for new feedback. The URL embeds a token,
  // so it is a secret. Empty disables the alert.
  feedbackWebhookUrl: process.env.FEEDBACK_WEBHOOK_URL || '',
  // Slack/Discord incoming-webhook URL for operational alerts (payments needing
  // attention, failed background jobs, risky staff actions). Also a secret. Empty disables it.
  opsAlertWebhookUrl: process.env.OPS_ALERT_WEBHOOK_URL || '',
})

export type Secrets = ReturnType<typeof readSecrets>
export type Environment = 'development' | 'test' | 'production'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const resolveEnv = (): Environment => {
  const raw = (process.env.NODE_ENV || 'development').trim().toLowerCase()
  if (raw === 'prod' || raw === 'production') return 'production'
  if (raw === 'test') return 'test'
  if (raw === 'dev' || raw === 'development') return 'development'
  throw new Error(
    `Invalid NODE_ENV "${process.env.NODE_ENV}". Expected one of: development, test, production.`,
  )
}

const loadEnvConfig = (env: Environment): EnvConfig => {
  switch (env) {
    case 'production':
      return productionConfig
    case 'test':
      return testConfig
    case 'development':
      return developmentConfig
  }
}

const TRUE_VALUES = new Set(['true', '1'])
const FALSE_VALUES = new Set(['false', '0'])

/**
 * Strict boolean env parsing: unset/empty is false, "true"/"1" and "false"/"0"
 * (any case) are accepted, anything else throws. Failing loudly matters for
 * safety switches — a typo like "yes" must not silently mean "off".
 */
export const parseBooleanEnv = (
  name: string,
  raw: string | undefined,
): boolean => {
  const value = raw?.trim().toLowerCase() ?? ''
  if (value === '' || FALSE_VALUES.has(value)) return false
  if (TRUE_VALUES.has(value)) return true
  throw new Error(`Invalid ${name} "${raw}". Expected true, false, 1 or 0.`)
}

/**
 * A chat webhook must be https on a known chat host. The URL is set by the
 * operator (never by a user), so this is a guard against a typo or a copied
 * internal address, not a defence against hostile input. Empty means "off".
 */
const assertWebhookUrl = (
  name: string,
  url: string,
  allowedHosts: readonly string[],
): void => {
  if (url === '') return
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`${name} is not a valid URL`)
  }
  const host = parsed.hostname.toLowerCase()
  const allowed = allowedHosts.some(
    (entry) => host === entry || host.endsWith(`.${entry}`),
  )
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error(`${name} must be an https URL without credentials`)
  }
  if (!allowed) {
    throw new Error(`${name} host must be one of: ${allowedHosts.join(', ')}`)
  }
}

export const assertFeedbackWebhookUrl = (
  url: string,
  allowedHosts: readonly string[],
): void => assertWebhookUrl('FEEDBACK_WEBHOOK_URL', url, allowedHosts)

export const assertOpsAlertWebhookUrl = (
  url: string,
  allowedHosts: readonly string[],
): void => assertWebhookUrl('OPS_ALERT_WEBHOOK_URL', url, allowedHosts)

export const buildConfig = (env: EnvConfig, secrets: Secrets) => {
  assertFeedbackWebhookUrl(
    secrets.feedbackWebhookUrl,
    env.feedback.webhookAllowedHosts,
  )
  assertOpsAlertWebhookUrl(
    secrets.opsAlertWebhookUrl,
    env.opsAlerts.webhookAllowedHosts,
  )

  // Parse comma-separated origins exclusively from process.env.CORS_ORIGINS
  const corsOrigins = secrets.corsOrigins
    ? secrets.corsOrigins
        .split(',')
        .map((origin) => origin.trim().replace(/\/$/, ''))
        .filter(Boolean)
    : env.env === 'development'
      ? ['http://localhost:5173', 'http://127.0.0.1:5173']
      : []

  const frontendUrl = corsOrigins[0] || 'http://localhost:5173'
  const port = Number(process.env.PORT) || env.server.port
  const apiPublicUrl = (
    secrets.apiPublicUrl ||
    (env.env === 'production' ? '' : `http://localhost:${port}`)
  ).replace(/\/$/, '')
  if (env.features.enableSso && env.env === 'production' && !apiPublicUrl) {
    throw new Error(
      'API_PUBLIC_URL is required when SSO is enabled in production',
    )
  }

  return {
    server: {
      port,
      nodeEnv: env.env,
      logLevel: env.server.logLevel,
      trustProxy: env.server.trustProxy,
      corsOrigins,
      frontendUrl,
      apiPublicUrl,
    },
    database: {
      url: secrets.databaseUrl,
    },
    auth: {
      accessTokenSecret: secrets.accessTokenSecret,
      accessTokenExpiry: env.auth.accessTokenExpiry,
      refreshTokenSecret: secrets.refreshTokenSecret,
      refreshTokenExpiry: env.auth.refreshTokenExpiry,
      magicLinkExpiryMinutes: env.auth.magicLinkExpiryMinutes,
      googleClientId: secrets.googleClientId,
    },
    redis: {
      url: secrets.redisUrl,
      tlsRejectUnauthorized: env.redis.tlsRejectUnauthorized,
    },
    cache: {
      enabled: env.cache.enabled,
      ttlMultiplier: env.cache.ttlMultiplier,
    },
    ml: {
      internalUrl: env.ml.internalUrl,
    },
    finnhub: {
      apiKey: secrets.finnhubApiKey,
    },
    smtp: {
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      user: secrets.smtpUser,
      pass: secrets.smtpPass,
    },
    brand: {
      logoUrl: env.brand.logoUrl,
    },
    email: {
      resendApiKey: secrets.resendApiKey,
      useSmtp: env.email.useSmtp,
      useResend: env.email.useResend,
      resendFrom: env.email.resendFrom,
    },
    fmp: {
      apiKey: secrets.fmpApiKey,
    },
    polygon: {
      apiKey: secrets.polygonApiKey,
    },
    twelveData: {
      apiKey: secrets.twelveDataApiKey,
    },
    axiom: {
      token: secrets.axiomToken,
      dataset: env.axiom.dataset,
    },
    posthog: {
      apiKey: secrets.posthogApiKey,
      host: env.posthog.host,
    },
    groq: {
      apiKey: secrets.groqApiKey,
      model: env.groq.model,
    },
    sendpk: {
      apiKey: secrets.sendpkApiKey,
      baseUrl: env.sendpk.baseUrl,
      templateId: secrets.sendpkTemplateId,
      mockProvider: env.sendpk.mockProvider,
    },
    safepay: {
      apiKey: secrets.safepayApiKey,
      secretKey: secrets.safepaySecretKey,
      webhookSecret: secrets.safepayWebhookSecret,
      proPlanId: secrets.safepayProPlanId,
      baseUrl: env.safepay.baseUrl,
      mockProvider: env.safepay.mockProvider,
      environment: env.safepay.environment,
      checkoutBaseUrl: env.safepay.checkoutBaseUrl,
    },
    features: env.features,
    feedback: {
      webhookUrl: secrets.feedbackWebhookUrl,
      webhookTimeoutMs: env.feedback.webhookTimeoutMs,
      webhookSnippetChars: env.feedback.webhookSnippetChars,
      submitLimitPerMinute: env.feedback.submitLimitPerMinute,
    },
    opsAlerts: {
      webhookUrl: secrets.opsAlertWebhookUrl,
      timeoutMs: env.opsAlerts.timeoutMs,
      dedupeWindowSeconds: env.opsAlerts.dedupeWindowSeconds,
    },
    admin: env.admin,
    priorityQueue: env.priorityQueue,
    market: {
      // Ops kill-switch for unscheduled exchange halts / ad-hoc closures: when
      // true the app treats the market as closed regardless of the calendar.
      // Deliberately an env var (not a code-config file) so it can be flipped
      // with a redeploy/restart — it is read once at boot.
      emergencyClosed: parseBooleanEnv(
        'EMERGENCY_MARKET_CLOSED',
        process.env.EMERGENCY_MARKET_CLOSED,
      ),
    },
    audit: {
      enabled: true,
      retentionDays: env.audit.retentionDays,
    },
    notifications: {
      retentionDays: env.notifications.retentionDays,
    },
  }
}

export type AppConfig = ReturnType<typeof buildConfig>

const activeEnv = resolveEnv()
const secrets = readSecrets()
const assembled = buildConfig(loadEnvConfig(activeEnv), secrets)

export const config: AppConfig = assembled
export default config
