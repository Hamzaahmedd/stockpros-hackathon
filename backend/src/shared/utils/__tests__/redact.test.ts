import { REDACTED_EMAIL, REDACTED_PHONE, redactPii } from '../redact'

describe('redactPii — email addresses', () => {
  it.each([
    ['plain', 'sent to user@example.com ok'],
    ['plus tag and dots', 'a.b+news@sub.example.co.uk rejected'],
    [
      'angle-bracketed as SMTP servers echo it',
      '550 5.1.1 <first.last@fund.com>: Recipient address rejected',
    ],
    ['upper case', 'USER@EXAMPLE.COM'],
    ['hyphenated domain', 'me@my-company.io'],
  ])('redacts an address (%s)', (_label, text) => {
    const out = redactPii(text)
    expect(out).toContain(REDACTED_EMAIL)
    expect(out).not.toMatch(/@/)
  })

  it('redacts every address in a message, not just the first', () => {
    const out = redactPii('from a@x.com to b@y.org cc c@z.net')
    expect(out).toBe(
      `from ${REDACTED_EMAIL} to ${REDACTED_EMAIL} cc ${REDACTED_EMAIL}`,
    )
  })

  it('keeps the surrounding message readable', () => {
    expect(redactPii('550 <person@fund.com>: rejected')).toBe(
      `550 <${REDACTED_EMAIL}>: rejected`,
    )
  })

  it.each([
    'no address here',
    'pkg@1.2.3 in a stack trace',
    'node_modules/@scope/pkg/index.js:10:5',
    'at Object.<anonymous> (/srv/app@2.0.1/dist/x.js:1:1)',
    'user@localhost',
    'price @ 12.50',
    'job-4 failed after 3 attempts',
    '',
  ])('leaves non-addresses alone: %j', (text) => {
    expect(redactPii(text)).toBe(text)
  })
})

describe('redactPii — phone numbers', () => {
  it('redacts international E.164 numbers', () => {
    expect(redactPii('OTP sent to +923001234567 now')).toBe(
      `OTP sent to ${REDACTED_PHONE} now`,
    )
    expect(redactPii('+14155552671')).toBe(REDACTED_PHONE)
  })

  it('does not touch ids, timestamps or amounts (bare digit runs are ambiguous)', () => {
    expect(redactPii('ts=1790750266734 amount=599900 id=1234567890')).toBe(
      'ts=1790750266734 amount=599900 id=1234567890',
    )
  })
})

describe('redactPii — safety', () => {
  it('is linear on adversarial input (no catastrophic backtracking)', () => {
    const hostile = [
      'a'.repeat(50_000) + '@',
      '@' + '.'.repeat(50_000),
      'a@' + 'b.'.repeat(25_000),
      'x@' + '-'.repeat(50_000) + '.com',
      '+' + '1'.repeat(50_000),
    ]
    const start = Date.now()
    for (const input of hostile) redactPii(input)
    expect(Date.now() - start).toBeLessThan(1_000)
  })

  it('is stateless across calls (global regexes do not leak lastIndex)', () => {
    expect(redactPii('a@b.com')).toBe(REDACTED_EMAIL)
    expect(redactPii('a@b.com')).toBe(REDACTED_EMAIL)
    expect(redactPii('+923001234567')).toBe(REDACTED_PHONE)
    expect(redactPii('+923001234567')).toBe(REDACTED_PHONE)
  })
})
