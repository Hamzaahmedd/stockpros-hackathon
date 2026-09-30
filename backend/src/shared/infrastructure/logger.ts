import axios from 'axios'
import pino from 'pino'
import { config } from '../../config'
import { redactPii } from '../utils/redact'

const SENSITIVE_KEY_PATTERN =
  /password|token|apikey|api_key|authorization|cookie|secret|phone|otp|\bcode\b/i

// Applied via JSON.stringify's replacer, so this reaches nested fields inside
// arbitrary thrown objects too — pino's own `redact` option can't, since by
// the time formatError's object gets there it's already a plain string.
const redactingReplacer = (key: string, value: unknown): unknown =>
  key && SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : value

const formatError = (err?: unknown): unknown => {
  if (!err) return ''
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const statusText = err.response?.statusText
    const data = err.response?.data
    const detail =
      (typeof data === 'object' && data !== null && 'detail' in data
        ? (data as { detail?: string }).detail
        : '') ||
      (typeof data === 'object' && data !== null && 'title' in data
        ? (data as { title?: string }).title
        : '') ||
      err.message
    let url = err.config?.url || ''
    if (url) {
      url = url.replace(/(token|apiKey|apikey)=([^&]+)/gi, '$1=[REDACTED]')
    }
    return `[AxiosError] ${err.config?.method?.toUpperCase() || 'REQ'} ${url} -> ${status || 'ERR'} ${statusText || ''}: ${detail}`
  }
  if (err instanceof Error) {
    return err.stack || err.message
  }
  if (typeof err === 'object') {
    try {
      return JSON.stringify(err, redactingReplacer, 2)
    } catch {
      return '[Unserializable Object]'
    }
  }
  if (
    typeof err === 'string' ||
    typeof err === 'number' ||
    typeof err === 'boolean' ||
    typeof err === 'bigint'
  ) {
    return err.toString()
  }
  return ''
}

// Setup Pino transports
const transports: pino.TransportTargetOptions[] = [
  {
    target: 'pino/file',
    options: { destination: 1 }, // stdout
  },
]

// Only ever enabled in production — even if a real token/dataset ends up in a
// dev or test .env, audit logs should never ship to Axiom from those environments.
if (
  config.server.nodeEnv === 'production' &&
  config.axiom.token &&
  config.axiom.dataset
) {
  transports.push({
    target: 'pino-opentelemetry-transport',
    options: {
      loggerName: 'stockpros-backend-logger',
      resourceAttributes: {
        'service.name': 'stockpros-backend',
        'service.version': '1.0.0',
      },
      logRecordProcessorOptions: {
        recordProcessorType: 'batch',
        processorConfig: {
          scheduledDelayMillis: 1_000,
          exportTimeoutMillis: 10_000,
        },
        exporterOptions: {
          protocol: 'http/protobuf',
          protobufExporterOptions: {
            // Axiom's OTLP/HTTP logs endpoint. The exporter requires these
            // protocol-specific options to be nested under this key.
            url: 'https://api.axiom.co/v1/logs',
            headers: {
              Authorization: `Bearer ${config.axiom.token}`,
              'X-Axiom-Dataset': config.axiom.dataset,
            },
          },
        },
      },
    },
  })
}

const pinoLogger = pino(
  {
    level: config.server.logLevel,
    // Defense-in-depth: redact secrets/PII even if a future call site logs a
    // raw object containing them (e.g. via formatError's generic
    // JSON.stringify fallback) — don't rely solely on call-site discipline.
    redact: {
      paths: [
        '*.password',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
        '*.apiKey',
        '*.api_key',
        '*.authorization',
        '*.Authorization',
        '*.headers.authorization',
        '*.headers.Authorization',
        '*.headers["set-cookie"]',
        '*.cookie',
        '*.cookies',
        '*.phoneNumber',
        '*.phone_number',
        '*.phone',
        '*.otp',
        '*.otpCode',
        '*.code',
        // Contact details — also caught by redactPii() when they appear inside message text
        'email',
        '*.email',
        'to',
        '*.to',
        'recipient',
        '*.recipient',
        '*.safepaySecretKey',
        '*.safepayWebhookSecret',
        '*.headers["x-sfpy-signature"]',
        '*["x-sfpy-signature"]',
      ],
      censor: '[REDACTED]',
    },
  },
  pino.transport({
    targets: transports,
  }),
)

/**
 * Structured fields for a log line. Primitives only, on purpose: it keeps call
 * sites to ids and counters and stops anyone passing a whole object (which is
 * how a stray email or token ends up in the logs).
 */
export type LogContext = Record<string, string | number | boolean | undefined>

// Defence in depth: whatever a call site interpolates, emails and phone
// numbers never reach the log sink. The primary rule still stands — pass ids,
// not addresses.
const scrubContext = (context: LogContext): LogContext =>
  Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      typeof value === 'string' ? redactPii(value) : value,
    ]),
  )

type Level = 'debug' | 'info' | 'warn'

const write = (level: Level, msg: string, context?: LogContext): void => {
  if (context) {
    pinoLogger[level](scrubContext(context), redactPii(msg))
  } else {
    pinoLogger[level](redactPii(msg))
  }
}

export const logger = {
  debug: (msg: string, context?: LogContext) => write('debug', msg, context),
  info: (msg: string, context?: LogContext) => write('info', msg, context),
  warn: (msg: string, context?: LogContext) => write('warn', msg, context),
  error: (msg: string, err?: unknown, context?: LogContext) => {
    const message = redactPii(msg)
    if (err) {
      pinoLogger.error(
        {
          ...(context && scrubContext(context)),
          error: redactPii(String(formatError(err))),
        },
        message,
      )
    } else if (context) {
      pinoLogger.error(scrubContext(context), message)
    } else {
      pinoLogger.error(message)
    }
  },
}
