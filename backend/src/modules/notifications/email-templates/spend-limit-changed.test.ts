import {
  buildSpendLimitChangedEmail,
  buildSpendLimitChangedEmailHtml,
  buildSpendLimitChangedEmailText,
  buildSpendLimitChangedSubject,
  type SpendLimitChangedData,
} from './spend-limit-changed'

const data = (
  overrides: Partial<SpendLimitChangedData> = {},
): SpendLimitChangedData => ({
  userName: 'Hamza',
  previousLimit: 'Rs 500',
  newLimit: 'Rs 1,200',
  ticketRef: 'SUP-4821',
  usageUrl: 'https://app.example/usage',
  ...overrides,
})

describe('spend limit changed email', () => {
  it('has a clear subject', () => {
    expect(buildSpendLimitChangedSubject()).toBe(
      'Your monthly spending limit was changed by StockPros support',
    )
  })

  it('states the previous limit, new limit and ticket in the text', () => {
    const text = buildSpendLimitChangedEmailText(data())
    expect(text).toContain('Hi Hamza')
    expect(text).toContain('from Rs 500 to Rs 1,200')
    expect(text).toContain('SUP-4821')
    expect(text).toContain('https://app.example/usage')
    expect(text).toContain('If you did not ask for this')
  })

  it('reads naturally when a limit is removed or first set', () => {
    expect(
      buildSpendLimitChangedEmailText(data({ newLimit: 'No limit' })),
    ).toContain('from Rs 500 to No limit')
    expect(
      buildSpendLimitChangedEmailText(data({ previousLimit: 'No limit' })),
    ).toContain('from No limit to Rs 1,200')
  })

  it('shows the values, ticket and a review link in the HTML', () => {
    const html = buildSpendLimitChangedEmailHtml(data(), 'cid:logo')
    expect(html).toContain('Previous limit')
    expect(html).toContain('Rs 500')
    expect(html).toContain('Rs 1,200')
    expect(html).toContain('SUP-4821')
    expect(html).toContain('href="https://app.example/usage"')
    expect(html).toContain('src="cid:logo"')
  })

  it('escapes customer-controlled and staff-supplied text in the HTML', () => {
    const html = buildSpendLimitChangedEmailHtml(
      data({ userName: '<script>alert(1)</script>', ticketRef: 'A"B' }),
    )
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('A"B')
  })

  it('builds subject, html and text together', () => {
    const email = buildSpendLimitChangedEmail(data())
    expect(email.subject).toBe(buildSpendLimitChangedSubject())
    expect(email.html).toContain('<!DOCTYPE html>')
    expect(email.text).toContain('SUP-4821')
  })
})
