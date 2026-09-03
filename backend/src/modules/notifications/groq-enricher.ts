import getGroqClient from '../../shared/infrastructure/clients/groq-client'
import config from '@/config'
import { logger } from '../../shared/infrastructure/logger'
import type { DigestNewsItem } from './email-templates'
import type { RawNewsInput } from './types'
import { z } from 'zod'

const MAX_BULLETS = 3

const digestResponseValidator = z
  .object({
    results: z.array(
      z
        .object({
          index: z.number().int().positive(),
          bullets: z.array(z.string().trim().min(1)).max(MAX_BULLETS),
        })
        .strict(),
    ),
  })
  .strict()

function extractJsonObject(content: string): string {
  const fencedJson = content.match(/```json\s*([\s\S]*?)\s*```/i)?.[1]
  if (fencedJson) return fencedJson

  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('Groq response did not contain a JSON object')
  }

  return content.slice(start, end + 1)
}

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
- Return only this JSON object, with no markdown: {"results":[{"index":1,"bullets":["fact"]}]}.
- Return one result for every input article, using its supplied index.`

  try {
    const completion = await client.chat.completions.create({
      model: config.groq.model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Extract bullet points from these ${articles.length} news articles:\n\n${articlesPayload}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 1024,
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = digestResponseValidator.parse(
      JSON.parse(extractJsonObject(raw)),
    )

    const bulletMap = new Map<number, string[]>()
    for (const entry of parsed.results) {
      bulletMap.set(entry.index, entry.bullets)
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
    logger.error(
      '[GroqEnricher] Groq enrichment failed — using stored bullets as fallback:',
      err,
    )

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
