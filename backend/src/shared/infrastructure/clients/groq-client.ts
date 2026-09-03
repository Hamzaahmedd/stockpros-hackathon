import Groq from 'groq-sdk'
import config from '@/config'
import { logger } from '../logger'

let _client: Groq | null = null

export const getGroqClient = (): Groq | null => {
  if (_client) return _client

  const apiKey = config.groq.apiKey
  if (!apiKey) {
    logger.warn(
      '[GroqClient] GROQ_API_KEY is not set — Groq enrichment is disabled. Falling back to rule-based bullet parser.',
    )
    return null
  }

  _client = new Groq({ apiKey })
  return _client
}

export default getGroqClient
