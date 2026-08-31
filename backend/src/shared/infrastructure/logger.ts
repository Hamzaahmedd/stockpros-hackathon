import axios from 'axios'

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
  if (typeof err === 'string' || typeof err === 'number' || typeof err === 'boolean' || typeof err === 'bigint') {
    return err.toString()
  }
  return ''
}

export const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string, err?: unknown) => {
    if (err) {
      console.error(`[ERROR] ${msg}`, formatError(err))
    } else {
      console.error(`[ERROR] ${msg}`)
    }
  },
}

