import { NewsCategory } from '@prisma/client'
import {
  articleIdsValidator,
  newsFeedValidator,
  newsSavedValidator,
  newsSearchValidator,
  newsSymbolValidator,
  symbolParamValidator,
} from '../validation'

describe('symbolParamValidator', () => {
  it('accepts a valid symbol', () => {
    expect(symbolParamValidator.parse({ symbol: 'AAPL' })).toEqual({
      symbol: 'AAPL',
    })
  })

  it('rejects an empty symbol', () => {
    expect(() => symbolParamValidator.parse({ symbol: '' })).toThrow()
  })

  it('rejects a symbol longer than 10 characters', () => {
    expect(() =>
      symbolParamValidator.parse({ symbol: 'A'.repeat(11) }),
    ).toThrow()
  })

  it('trims whitespace', () => {
    expect(symbolParamValidator.parse({ symbol: '  AAPL  ' })).toEqual({
      symbol: 'AAPL',
    })
  })
})

describe('newsFeedValidator', () => {
  it('applies defaults when nothing is provided', () => {
    const result = newsFeedValidator.parse({})
    expect(result).toMatchObject({ limit: 20, filter: 'all' })
  })

  it('coerces and bounds the limit', () => {
    expect(newsFeedValidator.parse({ limit: '5' }).limit).toBe(5)
    expect(() => newsFeedValidator.parse({ limit: '0' })).toThrow()
    expect(() => newsFeedValidator.parse({ limit: '51' })).toThrow()
  })

  it('rejects a non-uuid cursor', () => {
    expect(() => newsFeedValidator.parse({ cursor: 'not-a-uuid' })).toThrow()
  })

  it('accepts a valid uuid cursor', () => {
    const cursor = '11111111-1111-1111-1111-111111111111'
    expect(newsFeedValidator.parse({ cursor }).cursor).toBe(cursor)
  })

  it('validates category against the NewsCategory enum', () => {
    expect(
      newsFeedValidator.parse({ category: NewsCategory.GENERAL }).category,
    ).toBe(NewsCategory.GENERAL)
    expect(() => newsFeedValidator.parse({ category: 'NOT_REAL' })).toThrow()
  })

  it('uppercases the symbol', () => {
    expect(newsFeedValidator.parse({ symbol: 'aapl' }).symbol).toBe('AAPL')
  })

  it('restricts filter to the allowed enum values', () => {
    expect(newsFeedValidator.parse({ filter: 'portfolio' }).filter).toBe(
      'portfolio',
    )
    expect(() => newsFeedValidator.parse({ filter: 'invalid' })).toThrow()
  })

  it('rejects an invalid from/to date', () => {
    expect(() => newsFeedValidator.parse({ from: 'not-a-date' })).toThrow()
    expect(() => newsFeedValidator.parse({ to: 'not-a-date' })).toThrow()
  })

  it('accepts a valid from/to date', () => {
    const result = newsFeedValidator.parse({
      from: '2024-01-01',
      to: '2024-02-01',
    })
    expect(result.from).toBe('2024-01-01')
    expect(result.to).toBe('2024-02-01')
  })
})

describe('newsSymbolValidator', () => {
  it('applies default limit and allows an optional cursor', () => {
    expect(newsSymbolValidator.parse({})).toEqual({ limit: 20 })
  })
})

describe('newsSearchValidator', () => {
  it('requires q to be at least 2 characters when provided', () => {
    expect(() => newsSearchValidator.parse({ q: 'a' })).toThrow()
    expect(newsSearchValidator.parse({ q: 'ab' }).q).toBe('ab')
  })

  it('allows omitting q entirely', () => {
    expect(newsSearchValidator.parse({}).q).toBeUndefined()
  })

  it('uppercases the symbol and validates dates like the feed validator', () => {
    const result = newsSearchValidator.parse({
      symbol: 'tsla',
      from: '2024-01-01',
    })
    expect(result.symbol).toBe('TSLA')
    expect(() => newsSearchValidator.parse({ to: 'bad-date' })).toThrow()
  })
})

describe('newsSavedValidator', () => {
  it('applies the default limit', () => {
    expect(newsSavedValidator.parse({})).toEqual({ limit: 20 })
  })
})

describe('articleIdsValidator', () => {
  it('accepts a non-empty array of ids', () => {
    expect(articleIdsValidator.parse({ articleIds: ['a1', 'a2'] })).toEqual({
      articleIds: ['a1', 'a2'],
    })
  })

  it('rejects an empty array', () => {
    expect(() => articleIdsValidator.parse({ articleIds: [] })).toThrow()
  })

  it('rejects an array containing an empty string id', () => {
    expect(() => articleIdsValidator.parse({ articleIds: [''] })).toThrow()
  })
})
