import getGroqClient from '../../shared/infrastructure/clients/groq-client'
import { logger } from '../../shared/infrastructure/logger'
import type { DigestNewsItem } from './email-templates'
import type { RawNewsInput } from './types'

const GROQ_MODEL = 'llama-3.3-70b-versatile'
const MAX_BULLETS = 3

/**
 * Calls Groq to produce high-quality, investment-relevant bullet points for
 * a batch of news articles. Returns enriched DigestNewsItems.
 *
 * Falls back to the stored summaryBullets if Groq is unavailable or fails.
 */
export const enrichNewsWithGroq = async (
  articles: RawNewsInput[],
  fallbackBullets: string[][],
): Promise<DigestNewsItem[]> => {
  const client = getGroqClient()

  if (!client || articles.length === 0) {
    // No Groq client or no articles — return stored bullets as-is
    return articles.map((a, i) => ({
      symbol: a.symbol,
      headline: a.headline,
      bullets: fallbackBullets[i] ?? [],
      sentiment: a.sentiment,
      source: a.source,
      url: a.url,
    }))
  }

  const articlesPayload = articles
    .map(
      (a, i) =>
        `[${i + 1}] TICKER: ${a.symbol}\nHEADLINE: ${a.headline}\nSUMMARY: ${a.rawSummary || '(no summary available)'}`,
    )
    .join('\n\n')

  const systemPrompt = `You are a concise financial analyst writing a pre-market briefing for retail investors.
For each news article provided, extract exactly ${MAX_BULLETS} or fewer investment-relevant bullet points.
Rules:
- Focus on facts that affect stock price: earnings, guidance, M&A, analyst upgrades/downgrades, macro catalysts.
- Each bullet must be ≤ 15 words.
- Do NOT use vague phrases like "shares moved" or "investors reacted".
- Do NOT add commentary or opinion — only facts from the article.
- Respond with ONLY valid JSON, no markdown, no explanation.
- Format: { "results": [ { "index": 1, "bullets": ["...", "..."] }, ... ] }`

  try {
    const completion = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Extract bullet points from these ${articles.length} news articles:\n\n${articlesPayload}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as {
      results?: Array<{ index: number; bullets: string[] }>
    }

    const bulletMap = new Map<number, string[]>()
    for (const entry of parsed.results ?? []) {
      if (typeof entry.index === 'number' && Array.isArray(entry.bullets)) {
        bulletMap.set(entry.index, entry.bullets.slice(0, MAX_BULLETS))
      }
    }

    logger.info(
      `[GroqEnricher] Enriched ${bulletMap.size}/${articles.length} articles with Groq-generated bullets`,
    )

    return articles.map((a, i) => ({
      symbol: a.symbol,
      headline: a.headline,
      bullets: bulletMap.get(i + 1) ?? fallbackBullets[i] ?? [],
      sentiment: a.sentiment,
      source: a.source,
      url: a.url,
    }))
  } catch (err: unknown) {
    logger.error('[GroqEnricher] Groq enrichment failed — using stored bullets as fallback:', err)

    // Graceful fallback: return stored summaryBullets
    return articles.map((a, i) => ({
      symbol: a.symbol,
      headline: a.headline,
      bullets: fallbackBullets[i] ?? [],
      sentiment: a.sentiment,
      source: a.source,
      url: a.url,
    }))
  }
}
