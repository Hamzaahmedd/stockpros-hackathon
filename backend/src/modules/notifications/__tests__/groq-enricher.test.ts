jest.mock('../../../shared/infrastructure/clients/groq-client', () => ({
  __esModule: true,
  default: jest.fn(),
}))

import getGroqClient from '../../../shared/infrastructure/clients/groq-client'
import { enrichNewsWithGroq } from '../groq-enricher'

const mockGetGroqClient = getGroqClient as jest.Mock

const article = (overrides: Record<string, any> = {}): any => ({
  symbol: 'AAPL',
  headline: 'AAPL beats earnings',
  rawSummary: 'AAPL reported strong Q1 results.',
  sentiment: 'BULLISH',
  source: 'Polygon',
  url: 'https://example.com/a',
  ...overrides,
})

const groqResponse = (content: string) => ({
  chat: {
    completions: {
      create: jest.fn().mockResolvedValue({
        choices: [{ message: { content } }],
      }),
    },
  },
})

beforeEach(() => jest.clearAllMocks())

describe('enrichNewsWithGroq — no client / no articles', () => {
  it('returns the stored fallback bullets when no Groq client is configured', async () => {
    mockGetGroqClient.mockReturnValue(null)
    const result = await enrichNewsWithGroq([article()], [['stored bullet']])
    expect(result).toEqual([
      {
        symbol: 'AAPL',
        headline: 'AAPL beats earnings',
        bullets: ['stored bullet'],
        sentiment: 'BULLISH',
        source: 'Polygon',
        url: 'https://example.com/a',
      },
    ])
  })

  it('returns an empty array without calling Groq when there are no articles', async () => {
    const client = groqResponse('{}')
    mockGetGroqClient.mockReturnValue(client)
    const result = await enrichNewsWithGroq([], [])
    expect(result).toEqual([])
    expect(client.chat.completions.create).not.toHaveBeenCalled()
  })
})

describe('enrichNewsWithGroq — successful enrichment', () => {
  it('maps Groq-generated bullets back onto each article by index', async () => {
    const client = groqResponse(
      JSON.stringify({
        results: [{ index: 1, bullets: ['AI-generated bullet'] }],
      }),
    )
    mockGetGroqClient.mockReturnValue(client)

    const result = await enrichNewsWithGroq([article()], [['stored fallback']])
    expect(result[0].bullets).toEqual(['AI-generated bullet'])
  })

  it('parses a response wrapped in a markdown JSON code fence', async () => {
    const client = groqResponse(
      '```json\n' +
        JSON.stringify({
          results: [{ index: 1, bullets: ['fenced bullet'] }],
        }) +
        '\n```',
    )
    mockGetGroqClient.mockReturnValue(client)

    const result = await enrichNewsWithGroq([article()], [[]])
    expect(result[0].bullets).toEqual(['fenced bullet'])
  })

  it('falls back to stored bullets for an article Groq did not return a result for', async () => {
    const client = groqResponse(JSON.stringify({ results: [] }))
    mockGetGroqClient.mockReturnValue(client)

    const result = await enrichNewsWithGroq([article()], [['stored fallback']])
    expect(result[0].bullets).toEqual(['stored fallback'])
  })

  it('defaults to an empty array when neither Groq nor the stored fallback has bullets for an article', async () => {
    const client = groqResponse(JSON.stringify({ results: [] }))
    mockGetGroqClient.mockReturnValue(client)

    const result = await enrichNewsWithGroq([article({ rawSummary: '' })], [])
    expect(result[0].bullets).toEqual([])
  })

  it('handles multiple articles, preserving order and per-article bullets', async () => {
    const client = groqResponse(
      JSON.stringify({
        results: [
          { index: 1, bullets: ['first'] },
          { index: 2, bullets: ['second'] },
        ],
      }),
    )
    mockGetGroqClient.mockReturnValue(client)

    const result = await enrichNewsWithGroq(
      [article({ symbol: 'AAPL' }), article({ symbol: 'MSFT' })],
      [[], []],
    )
    expect(result.map((r) => r.bullets)).toEqual([['first'], ['second']])
  })
})

describe('enrichNewsWithGroq — failure fallback', () => {
  it('falls back to stored bullets when the Groq call itself rejects', async () => {
    const client = {
      chat: {
        completions: {
          create: jest.fn().mockRejectedValue(new Error('groq down')),
        },
      },
    }
    mockGetGroqClient.mockReturnValue(client)

    const result = await enrichNewsWithGroq([article()], [['stored fallback']])
    expect(result[0].bullets).toEqual(['stored fallback'])
  })

  it('falls back to stored bullets when Groq returns content with no JSON object at all', async () => {
    const client = groqResponse('Sorry, I cannot help with that.')
    mockGetGroqClient.mockReturnValue(client)

    const result = await enrichNewsWithGroq([article()], [['stored fallback']])
    expect(result[0].bullets).toEqual(['stored fallback'])
  })

  it('falls back to stored bullets when Groq returns a response failing schema validation', async () => {
    const client = groqResponse(
      JSON.stringify({ results: [{ index: 1, tooMany: true }] }),
    )
    mockGetGroqClient.mockReturnValue(client)

    const result = await enrichNewsWithGroq([article()], [['stored fallback']])
    expect(result[0].bullets).toEqual(['stored fallback'])
  })

  it('defaults to an empty bullets array when there is no stored fallback either', async () => {
    mockGetGroqClient.mockReturnValue(null)
    const result = await enrichNewsWithGroq([article()], [])
    expect(result[0].bullets).toEqual([])
  })

  it('treats a missing completion message content as an empty object before parsing', async () => {
    const client = {
      chat: {
        completions: { create: jest.fn().mockResolvedValue({ choices: [{}] }) },
      },
    }
    mockGetGroqClient.mockReturnValue(client)

    const result = await enrichNewsWithGroq([article()], [['stored fallback']])
    expect(result[0].bullets).toEqual(['stored fallback'])
  })
})
