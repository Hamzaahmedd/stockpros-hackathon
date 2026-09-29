import { buildAlertEmail } from './watchlist-alert'

describe('buildAlertEmail', () => {
  it('embeds the title, body, symbol, and default logo', () => {
    const html = buildAlertEmail('Price Alert', 'AAPL crossed $200', 'AAPL')
    expect(html).toContain(
      '<h2 style="color: #1a1a2e; margin-top: 0;">Price Alert</h2>',
    )
    expect(html).toContain('AAPL crossed $200')
    expect(html).toContain('<strong>AAPL</strong>')
    expect(html).toContain('src="cid:logo"')
  })

  it('uses a custom logo source when provided', () => {
    const html = buildAlertEmail(
      'Price Alert',
      'AAPL crossed $200',
      'AAPL',
      'https://cdn.example/logo.png',
    )
    expect(html).toContain('src="https://cdn.example/logo.png"')
  })
})
