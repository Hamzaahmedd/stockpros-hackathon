import {
  buildMagicLinkEmail,
  buildMagicLinkEmailHtml,
  buildMagicLinkEmailText,
  buildMagicLinkSubject,
} from './magic-link'

describe('buildMagicLinkSubject', () => {
  it('includes a timestamp in the subject line', () => {
    expect(buildMagicLinkSubject()).toMatch(/^Log in to StockPros \[.+\]$/)
  })
})

describe('buildMagicLinkEmailText', () => {
  it('includes the link and default 10-minute expiry', () => {
    const text = buildMagicLinkEmailText('https://app.example/verify?t=abc')
    expect(text).toContain('https://app.example/verify?t=abc')
    expect(text).toContain('valid for 10 minutes')
  })

  it('honors a custom expiry window', () => {
    const text = buildMagicLinkEmailText('https://app.example/verify?t=abc', 30)
    expect(text).toContain('valid for 30 minutes')
  })
})

describe('buildMagicLinkEmailHtml', () => {
  it('embeds the link, expiry, and default logo', () => {
    const html = buildMagicLinkEmailHtml('https://app.example/verify?t=abc')
    expect(html).toContain('href="https://app.example/verify?t=abc"')
    expect(html).toContain('expire in <strong>10 minutes</strong>')
    expect(html).toContain('src="cid:logo"')
  })

  it('uses a custom logo source when provided', () => {
    const html = buildMagicLinkEmailHtml(
      'https://app.example/verify?t=abc',
      10,
      'https://cdn.example/logo.png',
    )
    expect(html).toContain('src="https://cdn.example/logo.png"')
  })
})

describe('buildMagicLinkEmail', () => {
  it('bundles subject, html, and text together', () => {
    const email = buildMagicLinkEmail('https://app.example/verify?t=abc')
    expect(email.subject).toMatch(/^Log in to StockPros/)
    expect(email.html).toContain('https://app.example/verify?t=abc')
    expect(email.text).toContain('https://app.example/verify?t=abc')
  })
})

describe('magic link — escaping', () => {
  it('escapes the link placed in the button href, so a query string cannot break out of the attribute', () => {
    const html = buildMagicLinkEmailHtml(
      'https://app.example/auth/verify?token=abc&next="x" onclick="alert(1)',
      10,
    )
    expect(html).toContain(
      'href="https://app.example/auth/verify?token=abc&amp;next=&quot;x&quot; onclick=&quot;alert(1)"',
    )
    expect(html).not.toContain('onclick="alert(1)"')
  })

  it('keeps a normal login link working (ampersands become entities, which mail clients decode)', () => {
    const html = buildMagicLinkEmailHtml(
      'https://app.example/auth/verify?token=abc123&x=1',
      10,
    )
    expect(html).toContain(
      'href="https://app.example/auth/verify?token=abc123&amp;x=1"',
    )
  })

  it('escapes the logo source', () => {
    const html = buildMagicLinkEmailHtml(
      'https://app.example/x',
      10,
      'x" onerror="alert(1)',
    )
    expect(html).not.toContain('onerror="alert(1)')
  })

  it('leaves the plain-text body unescaped so the link is copy-pasteable as-is', () => {
    const link = 'https://app.example/auth/verify?token=abc&x=1'
    expect(buildMagicLinkEmailText(link, 10)).toContain(link)
  })
})
