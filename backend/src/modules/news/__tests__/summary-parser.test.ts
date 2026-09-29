import { parseSummaryBullets } from '../utils/summary-parser'

describe('parseSummaryBullets — empty input', () => {
  it.each([null, undefined, '', '   '])(
    'returns an empty array for %p',
    (input) => {
      expect(parseSummaryBullets(input)).toEqual([])
    },
  )
})

describe('parseSummaryBullets — sentence-split strategy', () => {
  it('splits on ". " followed by a capital letter and caps at SUMMARY_MAX_BULLETS', () => {
    const result = parseSummaryBullets(
      'Apple reported strong earnings this quarter. ' +
        'The company also announced a stock buyback program. ' +
        'Analysts remain optimistic about future growth prospects. ' +
        'A fourth sentence that should be dropped by the bullet cap.',
    )
    expect(result).toHaveLength(3)
    expect(result[0]).toBe('Apple reported strong earnings this quarter.')
    expect(result[2]).toBe(
      'Analysts remain optimistic about future growth prospects.',
    )
  })
})

describe('parseSummaryBullets — semicolon-split strategy', () => {
  it('falls back to semicolons when there is no sentence-ending period', () => {
    const result = parseSummaryBullets(
      'Revenue grew significantly this year; ' +
        'costs remained under control throughout; ' +
        'margins improved as a result of efficiencies',
    )
    expect(result).toHaveLength(3)
    expect(result[0]).toBe('Revenue grew significantly this year.')
  })

  it('discards an empty segment produced by a stray semicolon', () => {
    const result = parseSummaryBullets(
      'Revenue grew significantly this year; ; ' +
        'margins improved as a result of efficiencies',
    )
    expect(result).toEqual([
      'Revenue grew significantly this year.',
      'Margins improved as a result of efficiencies.',
    ])
  })
})

describe('parseSummaryBullets — dash-split strategy', () => {
  it('falls back to " - " separators when neither periods nor semicolons split it', () => {
    const result = parseSummaryBullets(
      'Company reports record revenue growth - ' +
        'Management raised full year guidance - ' +
        'Investors reacted positively to the news',
    )
    expect(result).toHaveLength(3)
    expect(result[1]).toBe('Management raised full year guidance.')
  })
})

describe('parseSummaryBullets — single-bullet fallback', () => {
  it('returns one cleaned bullet when no strategy yields two+ candidates', () => {
    const result = parseSummaryBullets(
      'Company reported strong revenue growth this quarter',
    )
    expect(result).toEqual([
      'Company reported strong revenue growth this quarter.',
    ])
  })

  it('returns an empty array when the fallback bullet is still too short', () => {
    expect(parseSummaryBullets('Too short')).toEqual([])
  })
})

describe('parseSummaryBullets — bullet cleaning', () => {
  it('strips leading bullet/number markers and collapses whitespace', () => {
    const result = parseSummaryBullets('-   Revenue   grew   this   quarter  ')
    expect(result).toEqual(['Revenue grew this quarter.'])
  })

  it('capitalizes the first letter', () => {
    const result = parseSummaryBullets('revenue grew significantly this year')
    expect(result[0].startsWith('Revenue')).toBe(true)
  })

  it('does not append a period when the text already ends with terminal punctuation', () => {
    const result = parseSummaryBullets('Revenue grew significantly this year!')
    expect(result).toEqual(['Revenue grew significantly this year!'])
  })

  it('truncates an overly long bullet at a word boundary and appends an ellipsis', () => {
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
    const result = parseSummaryBullets(words)
    expect(result[0].endsWith('...')).toBe(true)
    expect(result[0].length).toBeLessThanOrEqual(184)
  })

  it('truncates at the character limit when no good word boundary exists near the cutoff', () => {
    const noSpaces = 'x'.repeat(200)
    const result = parseSummaryBullets(noSpaces)
    expect(result[0].endsWith('...')).toBe(true)
    expect(result[0].startsWith('X')).toBe(true)
    expect(result[0]).toHaveLength(183)
  })
})
