import {
  buildPremarketDigestHtml,
  buildPremarketDigestText,
  type PremarketDigestData,
} from './premarket-digest'

const digestData: PremarketDigestData = {
  userName: 'Hamza <Trader>',
  greeting: 'Good Morning',
  issuedAtFormatted: 'Wed, Sep 3, 2026, 10:30 AM PKT',
  dashboardUrl: 'https://example.stockpros.test/news?filter=watchlist',
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
    expect(html).toContain('Good Morning, Hamza &lt;Trader&gt;')
    expect(html).toContain('Wed, Sep 3, 2026, 10:30 AM PKT')
    expect(html).toContain(
      'https://example.stockpros.test/news?filter=watchlist',
    )
  })

  it('renders a negative-change ticker in red without a leading +', () => {
    const html = buildPremarketDigestHtml({
      ...digestData,
      watchlistItems: [
        { symbol: 'TSLA', currentPrice: 350, changePercent: -2.5 },
      ],
    })
    expect(html).toContain('-2.50%')
    expect(html).toContain('#f43f5e')
  })

  it('renders an em dash placeholder when price/changePercent are null', () => {
    const html = buildPremarketDigestHtml({
      ...digestData,
      watchlistItems: [
        { symbol: 'TSLA', currentPrice: null, changePercent: null },
      ],
    })
    expect(html).toContain('—')
    expect(html).not.toContain('null')
  })

  it('shows the empty-watchlist placeholder row when there are no watchlist items', () => {
    const html = buildPremarketDigestHtml({ ...digestData, watchlistItems: [] })
    expect(html).toContain('No active watchlist symbols found.')
  })

  it('shows the no-news placeholder when topNews is empty', () => {
    const html = buildPremarketDigestHtml({ ...digestData, topNews: [] })
    expect(html).toContain(
      'No major overnight news events detected for your symbols.',
    )
  })

  it('shows a fallback bullet when an article has no bullets', () => {
    const html = buildPremarketDigestHtml({
      ...digestData,
      topNews: [
        {
          symbol: 'TSLA',
          headline: 'Some headline',
          bullets: [],
          sentiment: null,
        },
      ],
    })
    expect(html).toContain('Market coverage in progress.')
  })

  it('renders BEARISH sentiment in red and omits the sentiment badge when null', () => {
    const bearish = buildPremarketDigestHtml({
      ...digestData,
      topNews: [
        {
          symbol: 'TSLA',
          headline: 'h',
          bullets: ['b'],
          sentiment: 'BEARISH',
        },
      ],
    })
    expect(bearish).toContain('BEARISH')

    const neutralNoBadge = buildPremarketDigestHtml({
      ...digestData,
      topNews: [
        { symbol: 'TSLA', headline: 'h', bullets: ['b'], sentiment: null },
      ],
    })
    expect(neutralNoBadge).not.toContain('●')
  })

  it('defaults the logo to cid:logo when logoSrc is not provided', () => {
    const html = buildPremarketDigestHtml(digestData)
    expect(html).toContain('src="cid:logo"')
  })

  it('uses the provided logoSrc when given', () => {
    const html = buildPremarketDigestHtml({
      ...digestData,
      logoSrc: 'https://cdn.example/logo.png',
    })
    expect(html).toContain('src="https://cdn.example/logo.png"')
  })
})

describe('buildPremarketDigestText', () => {
  it('formats watchlist items and news bullets as plain text', () => {
    const text = buildPremarketDigestText(digestData)
    expect(text).toContain('<TSLA>: $350.00 (+1.25%)')
    expect(text).toContain(
      '[<TSLA>] Headline <strong>must remain visible</strong>',
    )
    expect(text).toContain('* Bullet <em>must remain visible</em>')
    expect(text).toContain(digestData.dashboardUrl)
  })

  it('shows negative changePercent without a leading +', () => {
    const text = buildPremarketDigestText({
      ...digestData,
      watchlistItems: [
        { symbol: 'TSLA', currentPrice: 100, changePercent: -3.5 },
      ],
    })
    expect(text).toContain('(-3.50%)')
  })

  it('shows N/A for a null price', () => {
    const text = buildPremarketDigestText({
      ...digestData,
      watchlistItems: [
        { symbol: 'TSLA', currentPrice: null, changePercent: 1 },
      ],
    })
    expect(text).toContain('$N/A')
  })

  it('defaults a null changePercent to +0.00%', () => {
    const text = buildPremarketDigestText({
      ...digestData,
      watchlistItems: [
        { symbol: 'TSLA', currentPrice: 100, changePercent: null },
      ],
    })
    expect(text).toContain('(+0.00%)')
  })

  it('shows placeholder text for empty watchlist and news', () => {
    const text = buildPremarketDigestText({
      ...digestData,
      watchlistItems: [],
      topNews: [],
    })
    expect(text).toContain('No active watchlist tickers.')
    expect(text).toContain(
      'No major overnight news events detected for your symbols.',
    )
  })
})
