import axios from 'axios'
import pino from 'pino'

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
      return JSON.stringify(err, null, 2)
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

// Check for Axiom environment variables
const AXIOM_TOKEN = process.env.AXIOM_TOKEN || ''
const AXIOM_DATASET = process.env.AXIOM_DATASET || ''

// Setup Pino transports
const transports: pino.TransportTargetOptions[] = [
  {
    target: 'pino/file',
    options: { destination: 1 }, // stdout
  },
]

if (AXIOM_TOKEN && AXIOM_DATASET) {
  transports.push({
    target: 'pino-opentelemetry-transport',
    options: {
      loggerName: 'stockpros-backend-logger',
      resourceAttributes: {
        'service.name': 'stockpros-backend',
        'service.version': '1.0.0',
      },
      logRecordProcessorOptions: {
        exporterOptions: {
          protocol: 'http/protobuf',
          url: 'https://api.axiom.co/v1/traces', // Axiom's OTLP ingest endpoint
          headers: {
            Authorization: `Bearer ${AXIOM_TOKEN}`,
            'X-Axiom-Dataset': AXIOM_DATASET,
          },
        },
      },
    },
  })
}

const pinoLogger = pino(
  {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
  pino.transport({
    targets: transports,
  })
)

export const logger = {
  info: (msg: string) => pinoLogger.info(msg),
  warn: (msg: string) => pinoLogger.warn(msg),
  error: (msg: string, err?: unknown) => {
    if (err) {
      pinoLogger.error({ error: formatError(err) }, msg)
    } else {
      pinoLogger.error(msg)
    }
  },
}
