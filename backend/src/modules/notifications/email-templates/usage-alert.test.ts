import { UsageAlertKind } from '@prisma/client'
import {
  buildUsageAlertEmail,
  buildUsageAlertEmailHtml,
  buildUsageAlertEmailText,
  buildUsageAlertSubject,
  type UsageAlertData,
} from './usage-alert'

const data = (overrides: Partial<UsageAlertData> = {}): UsageAlertData => ({
  kind: UsageAlertKind.QUOTA_80,
  userName: 'Hamza',
  usedSignals: 240,
  includedSignals: 300,
  resetsOn: 'Oct 10, 2030',
  creditBalance: 'Rs 950',
  usageUrl: 'https://app.example/usage',
  ...overrides,
})

describe('usage alert email', () => {
  it.each([
    [UsageAlertKind.QUOTA_80, "You've used 80% of your monthly AI signals"],
    [
      UsageAlertKind.QUOTA_EXHAUSTED,
      "You've used all your included AI signals",
    ],
    [UsageAlertKind.LOW_BALANCE, 'Your AI credit balance is running low'],
    [UsageAlertKind.CAP_90, "You're close to your monthly spending limit"],
  ])('%s has its own subject', (kind, subject) => {
    expect(buildUsageAlertSubject({ kind })).toBe(subject)
  })

  it('80%: states used/included, the reset date and the credit balance', () => {
    const text = buildUsageAlertEmailText(data())
    expect(text).toContain('240 of your 300 included AI signals')
    expect(text).toContain('Oct 10, 2030')
    expect(text).toContain('Rs 950')
    expect(text).toContain('https://app.example/usage')
    expect(text).toContain('Hi Hamza')
  })

  it('exhausted: says credits are used from now on', () => {
    const text = buildUsageAlertEmailText(
      data({ kind: UsageAlertKind.QUOTA_EXHAUSTED, usedSignals: 300 }),
    )
    expect(text).toContain(
      'All 300 included AI signals are used until Oct 10, 2030',
    )
    expect(text).toContain('paid from your credits')
  })

  it('low balance: states the balance and what happens when it runs out', () => {
    const text = buildUsageAlertEmailText(
      data({ kind: UsageAlertKind.LOW_BALANCE, creditBalance: 'Rs 120' }),
    )
    expect(text).toContain('Your balance is Rs 120')
    expect(text).toContain('top up')
  })

  it('spending limit: states what was spent against the limit', () => {
    const text = buildUsageAlertEmailText(
      data({
        kind: UsageAlertKind.CAP_90,
        spendLimit: 'Rs 500',
        spentSoFar: 'Rs 450',
      }),
    )
    expect(text).toContain('spent Rs 450 of your Rs 500 monthly limit')
  })

  it('never prints "undefined" if the spending figures are missing from the job', () => {
    const text = buildUsageAlertEmailText(data({ kind: UsageAlertKind.CAP_90 }))
    expect(text).not.toContain('undefined')
    expect(text).toContain('monthly limit on credits')
  })

  it('renders the same content in HTML with the call-to-action link', () => {
    const html = buildUsageAlertEmailHtml(data())
    expect(html).toContain('240 of your 300 included AI signals')
    expect(html).toContain('href="https://app.example/usage"')
    expect(html).toContain('View usage')
    expect(html).toContain('turn these emails off')
  })

  it('escapes the recipient name and link in HTML but not in plain text', () => {
    const hostile = data({
      userName: '<script>alert(1)</script>',
      usageUrl: 'https://app.example/usage?a=1&b="2"',
    })
    const html = buildUsageAlertEmailHtml(hostile)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('b="2"')
    expect(buildUsageAlertEmailText(hostile)).toContain(
      '<script>alert(1)</script>',
    )
  })

  it('bundles subject, html and text, using the given logo source', () => {
    const email = buildUsageAlertEmail(data(), 'https://cdn.example/logo.png')
    expect(email.subject).toBe(buildUsageAlertSubject(data()))
    expect(email.html).toContain('https://cdn.example/logo.png')
    expect(email.text).toBe(buildUsageAlertEmailText(data()))
  })
})
