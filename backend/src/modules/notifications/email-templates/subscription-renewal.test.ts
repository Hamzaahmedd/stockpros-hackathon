import {
  buildRenewalReminderEmail,
  buildRenewalReminderEmailHtml,
  buildRenewalReminderEmailText,
  buildRenewalReminderSubject,
  type RenewalReminderData,
} from './subscription-renewal'

const baseData: RenewalReminderData = {
  userName: 'Hamza',
  amount: 'Rs 5,999',
  renewsOn: 'Oct 15, 2026',
  manageUrl: 'https://app.example/plans',
  variant: 'card-on',
}

describe('buildRenewalReminderSubject', () => {
  it('returns the card-on subject', () => {
    expect(buildRenewalReminderSubject('card-on')).toBe(
      'Upcoming Renewal: Your Pro Plan bills in 3 days',
    )
  })

  it('returns the card-off subject', () => {
    expect(buildRenewalReminderSubject('card-off')).toBe(
      'Your Pro Plan Access Expires in 3 Days',
    )
  })

  it('returns the wallet subject', () => {
    expect(buildRenewalReminderSubject('wallet')).toBe(
      'Renew Your Pro Plan Access (JazzCash/Easypaisa)',
    )
  })
})

describe('buildRenewalReminderEmailText', () => {
  it('includes the card-on body, CTA, and manage URL', () => {
    const text = buildRenewalReminderEmailText(baseData)
    expect(text).toContain('Hi Hamza,')
    expect(text).toContain('Rs 5,999')
    expect(text).toContain('Oct 15, 2026')
    expect(text).toContain('Manage Subscription: https://app.example/plans')
  })

  it('includes the card-off CTA', () => {
    const text = buildRenewalReminderEmailText({
      ...baseData,
      variant: 'card-off',
    })
    expect(text).toContain('Turn Auto-Renewal Back On')
    expect(text).toContain('revert to Free')
  })

  it('includes the wallet CTA', () => {
    const text = buildRenewalReminderEmailText({
      ...baseData,
      variant: 'wallet',
    })
    expect(text).toContain('Pay & Extend for 30 Days')
  })
})

describe('buildRenewalReminderEmailHtml', () => {
  it('embeds the user name, CTA button, manage URL, and default logo', () => {
    const html = buildRenewalReminderEmailHtml(baseData)
    expect(html).toContain('Hi Hamza,')
    expect(html).toContain('href="https://app.example/plans"')
    expect(html).toContain('Manage Subscription')
    expect(html).toContain('src="cid:logo"')
  })

  it('uses a custom logo source when provided', () => {
    const html = buildRenewalReminderEmailHtml(
      baseData,
      'https://cdn.example/logo.png',
    )
    expect(html).toContain('src="https://cdn.example/logo.png"')
  })

  it('renders the card-off title/CTA', () => {
    const html = buildRenewalReminderEmailHtml({
      ...baseData,
      variant: 'card-off',
    })
    expect(html).toContain('Your Pro Plan Access Expires in 3 Days')
    expect(html).toContain('Turn Auto-Renewal Back On')
  })

  it('renders the wallet title/CTA', () => {
    const html = buildRenewalReminderEmailHtml({
      ...baseData,
      variant: 'wallet',
    })
    expect(html).toContain('Renew Your Pro Plan Access (JazzCash/Easypaisa)')
    expect(html).toContain('Pay & Extend for 30 Days')
  })
})

describe('buildRenewalReminderEmail', () => {
  it('bundles subject, html, and text together', () => {
    const email = buildRenewalReminderEmail(baseData)
    expect(email.subject).toBe(
      'Upcoming Renewal: Your Pro Plan bills in 3 days',
    )
    expect(email.html).toContain('Hi Hamza,')
    expect(email.text).toContain('Hi Hamza,')
  })
})
