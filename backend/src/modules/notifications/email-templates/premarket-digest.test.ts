import {
  buildPremarketDigestHtml,
  type PremarketDigestData,
} from './premarket-digest'

const digestData: PremarketDigestData = {
  userName: 'Hamza <Trader>',
  issuedAtFormatted: 'Wed, Sep 3, 2026, 10:30 AM PKT',
  dashboardUrl: 'https://example.stockpros.test/dashboard',
  watchlistItems: [
    { symbol: '<TSLA>', currentPrice: 350, changePercent: 1.25 },
  ],
  topNews: [
    {
      symbol: '<TSLA>',
      headline: 'Headline <strong>must remain visible</strong>',
      bullets: ['Bullet <em>must remain visible</em>'],
      sentiment: 'BULLISH',
    },
  ],
}

describe('buildPremarketDigestHtml', () => {
  it('escapes dynamic content and displays the precise issued timestamp', () => {
    const html = buildPremarketDigestHtml(digestData)

    expect(html).toContain('Hamza &lt;Trader&gt;')
    expect(html).toContain('&lt;TSLA&gt;')
    expect(html).toContain(
      'Headline &lt;strong&gt;must remain visible&lt;/strong&gt;',
    )
    expect(html).toContain('Bullet &lt;em&gt;must remain visible&lt;/em&gt;')
    expect(html).toContain('Wed, Sep 3, 2026, 10:30 AM PKT')
    expect(html).toContain('https://example.stockpros.test/dashboard')
  })
})
