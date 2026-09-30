import {
  acceptInviteValidator,
  addDomainValidator,
  addSeatsValidator,
  createInviteValidator,
  createTeamValidator,
  creditLimitValidator,
  domainValidator,
  idParamValidator,
  instructionsValidator,
  preferencesValidator,
  researchNoteValidator,
  searchQueryValidator,
  sharedScreenerValidator,
  sharedWatchlistValidator,
  userIdParamValidator,
  verifyDomainValidator,
} from '../validation'

const UUID = '123e4567-e89b-12d3-a456-426614174000'

describe('createTeamValidator', () => {
  it('accepts a valid payload and trims the name', () => {
    expect(
      createTeamValidator.parse({ name: '  Fund  ', seatCount: 5 }),
    ).toEqual({ name: 'Fund', seatCount: 5 })
  })
  it('enforces the 2..150 seat bounds', () => {
    expect(
      createTeamValidator.safeParse({ name: 'Fund', seatCount: 1 }).success,
    ).toBe(false)
    expect(
      createTeamValidator.safeParse({ name: 'Fund', seatCount: 151 }).success,
    ).toBe(false)
    expect(
      createTeamValidator.safeParse({ name: 'Fund', seatCount: 150 }).success,
    ).toBe(true)
  })
})

describe('addSeatsValidator', () => {
  it.each([1, 150])('accepts %d', (seatCount) => {
    expect(addSeatsValidator.safeParse({ seatCount }).success).toBe(true)
  })
  it.each([0, 151, 1.5, '3'])('rejects %p', (seatCount) => {
    expect(addSeatsValidator.safeParse({ seatCount }).success).toBe(false)
  })
  it('requires seatCount', () => {
    expect(addSeatsValidator.safeParse({}).success).toBe(false)
  })
})

describe('createInviteValidator', () => {
  it('lowercases/trims the email and defaults the role to MEMBER', () => {
    expect(createInviteValidator.parse({ email: '  A@Fund.COM ' })).toEqual({
      email: 'a@fund.com',
      role: 'MEMBER',
    })
  })
  it('accepts ADMIN and rejects OWNER or bad emails', () => {
    expect(
      createInviteValidator.parse({ email: 'a@fund.com', role: 'ADMIN' }).role,
    ).toBe('ADMIN')
    expect(
      createInviteValidator.safeParse({ email: 'a@fund.com', role: 'OWNER' })
        .success,
    ).toBe(false)
    expect(createInviteValidator.safeParse({ email: 'nope' }).success).toBe(
      false,
    )
  })
})

describe('simple validators', () => {
  it('acceptInviteValidator requires a token', () => {
    expect(acceptInviteValidator.safeParse({ token: 'x' }).success).toBe(true)
    expect(acceptInviteValidator.safeParse({ token: '' }).success).toBe(false)
  })
  it('id param validators require uuids', () => {
    expect(userIdParamValidator.safeParse({ userId: UUID }).success).toBe(true)
    expect(userIdParamValidator.safeParse({ userId: '1' }).success).toBe(false)
    expect(idParamValidator.safeParse({ id: UUID }).success).toBe(true)
    expect(idParamValidator.safeParse({ id: 'x' }).success).toBe(false)
  })
})

describe('domain validators', () => {
  it('normalises case and whitespace', () => {
    expect(domainValidator.parse('  Fund.COM ')).toBe('fund.com')
    expect(domainValidator.parse('sub.fund.co.uk')).toBe('sub.fund.co.uk')
  })
  it.each(['fund', 'http://fund.com', 'fund.com/path', 'a b.com', '-.c', ''])(
    'rejects %p',
    (value) => {
      expect(domainValidator.safeParse(value).success).toBe(false)
    },
  )
  it('rejects labels over 63 characters', () => {
    expect(domainValidator.safeParse(`${'a'.repeat(64)}.com`).success).toBe(
      false,
    )
  })
  it('addDomainValidator defaults restrictOrgCreation to true', () => {
    expect(addDomainValidator.parse({ domain: 'fund.com' })).toEqual({
      domain: 'fund.com',
      restrictOrgCreation: true,
    })
    expect(
      addDomainValidator.parse({
        domain: 'fund.com',
        restrictOrgCreation: false,
      }).restrictOrgCreation,
    ).toBe(false)
  })
  it('verifyDomainValidator requires a domain', () => {
    expect(verifyDomainValidator.safeParse({}).success).toBe(false)
    expect(
      verifyDomainValidator.safeParse({ domain: 'fund.com' }).success,
    ).toBe(true)
  })
})

describe('instructionsValidator', () => {
  it('accepts null and trims strings', () => {
    expect(instructionsValidator.parse({ orgInstructions: null })).toEqual({
      orgInstructions: null,
    })
    expect(instructionsValidator.parse({ orgInstructions: ' hi ' })).toEqual({
      orgInstructions: 'hi',
    })
  })
  it('rejects more than 4000 characters', () => {
    expect(
      instructionsValidator.safeParse({ orgInstructions: 'a'.repeat(4001) })
        .success,
    ).toBe(false)
  })
})

describe('creditLimitValidator', () => {
  it.each([0, 100, null])('accepts %p', (value) => {
    expect(
      creditLimitValidator.safeParse({ monthlyCreditLimitPaisa: value })
        .success,
    ).toBe(true)
  })
  it.each([-1, 1.5])('rejects %p', (value) => {
    expect(
      creditLimitValidator.safeParse({ monthlyCreditLimitPaisa: value })
        .success,
    ).toBe(false)
  })
})

describe('preferencesValidator', () => {
  it('accepts partial valid preferences', () => {
    expect(preferencesValidator.parse({})).toEqual({})
    expect(
      preferencesValidator.parse({
        theme: 'DARK',
        chartLayout: 'GRID',
        indicators: ['rsi'],
      }),
    ).toEqual({ theme: 'DARK', chartLayout: 'GRID', indicators: ['rsi'] })
  })
  it('rejects unknown keys (strict) and invalid values', () => {
    expect(preferencesValidator.safeParse({ extra: 1 }).success).toBe(false)
    expect(preferencesValidator.safeParse({ theme: 'PINK' }).success).toBe(
      false,
    )
    expect(
      preferencesValidator.safeParse({
        indicators: Array.from({ length: 21 }, () => 'a'),
      }).success,
    ).toBe(false)
  })
})

describe('shared asset validators', () => {
  it('sharedWatchlistValidator uppercases symbols', () => {
    expect(
      sharedWatchlistValidator.parse({
        name: 'W',
        symbols: ['aapl', ' msft '],
      }),
    ).toEqual({ name: 'W', symbols: ['AAPL', 'MSFT'] })
    expect(
      sharedWatchlistValidator.safeParse({ name: 'W', symbols: [] }).success,
    ).toBe(false)
  })
  it('sharedScreenerValidator accepts arbitrary criteria records', () => {
    expect(
      sharedScreenerValidator.parse({
        name: 'S',
        criteria: { pe: { lt: 10 } },
      }),
    ).toEqual({ name: 'S', criteria: { pe: { lt: 10 } } })
    expect(
      sharedScreenerValidator.safeParse({ name: 'S', criteria: 'x' }).success,
    ).toBe(false)
  })
  it('researchNoteValidator uppercases the symbol and bounds content', () => {
    expect(
      researchNoteValidator.parse({ symbol: 'aapl', content: 'c' }),
    ).toEqual({ symbol: 'AAPL', content: 'c' })
    expect(
      researchNoteValidator.safeParse({ symbol: 'A', content: '' }).success,
    ).toBe(false)
  })
  it('searchQueryValidator needs 2..100 characters', () => {
    expect(searchQueryValidator.parse({ q: ' ab ' })).toEqual({ q: 'ab' })
    expect(searchQueryValidator.safeParse({ q: 'a' }).success).toBe(false)
    expect(searchQueryValidator.safeParse({ q: 'a'.repeat(101) }).success).toBe(
      false,
    )
  })
})

describe('preferencesValidator — null clears a field', () => {
  it('accepts null for each field', () => {
    expect(
      preferencesValidator.parse({
        theme: null,
        chartLayout: null,
        indicators: null,
      }),
    ).toEqual({ theme: null, chartLayout: null, indicators: null })
  })

  it('still rejects invalid values and unknown keys', () => {
    expect(preferencesValidator.safeParse({ theme: 'PINK' }).success).toBe(
      false,
    )
    expect(preferencesValidator.safeParse({ extra: null }).success).toBe(false)
  })
})

describe('sharedScreenerValidator — criteria must be real JSON', () => {
  const parse = (criteria: unknown) =>
    sharedScreenerValidator.safeParse({ name: 'Value', criteria })

  it('accepts nested JSON values', () => {
    const criteria = {
      minMarketCap: 1_000_000_000,
      sectors: ['Tech', 'Energy'],
      flags: { dividend: true, note: null },
      ranges: [
        [1, 2],
        [3, 4],
      ],
    }
    expect(parse(criteria)).toEqual({
      success: true,
      data: { name: 'Value', criteria },
    })
  })

  it.each([
    ['a top-level array', [1, 2]],
    ['a string', 'x'],
    ['null', null],
    ['undefined', undefined],
    ['a nested undefined', { a: undefined }],
    ['a function', { a: () => 1 }],
    ['NaN', { a: NaN }],
    ['Infinity', { a: Infinity }],
    ['a Date object', { a: new Date() }],
    ['a bigint', { a: BigInt(1) }],
    ['a symbol', { a: Symbol('x') }],
  ])('rejects %s', (_label, criteria) => {
    expect(parse(criteria).success).toBe(false)
  })

  it('validates depth-first: a bad leaf deep inside is still caught', () => {
    expect(parse({ a: { b: [{ c: { d: NaN } }] } }).success).toBe(false)
    expect(parse({ a: { b: [{ c: { d: 1 } }] } }).success).toBe(true)
  })
})
