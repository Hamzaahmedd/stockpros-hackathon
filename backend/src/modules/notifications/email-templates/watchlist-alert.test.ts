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

describe('buildAlertEmail — escaping', () => {
  const hostile = '<img src=x onerror=alert(1)>"\'&'

  it('escapes the title, body and symbol', () => {
    const html = buildAlertEmail(hostile, hostile, hostile)
    expect(html.match(/&lt;img src=x onerror=alert\(1\)&gt;/g)).toHaveLength(3)
    expect(html).not.toContain('<img src=x')
  })

  it('escapes the logo source used in an attribute', () => {
    const html = buildAlertEmail('t', 'b', 'S', 'x" onerror="alert(1)')
    expect(html).not.toContain('onerror="alert(1)')
    expect(html).toContain('src="x&quot; onerror=&quot;alert(1)"')
  })

  it('keeps legitimate text (prices, symbols, percentages) readable', () => {
    const html = buildAlertEmail(
      'AAPL up 5% today',
      'AAPL is now $201.50, above your $200.00 alert.',
      'AAPL',
    )
    expect(html).toContain('AAPL up 5% today')
    expect(html).toContain('$201.50')
  })
})
