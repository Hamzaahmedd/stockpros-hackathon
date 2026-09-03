export interface WatchlistDigestItem {
  symbol: string
  currentPrice: number | null
  changePercent: number | null
}

export interface DigestNewsItem {
  symbol: string
  headline: string
  bullets: string[]
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null
  source?: string
  url?: string
}

export interface PremarketDigestData {
  userName: string
  dateFormatted: string
  watchlistItems: WatchlistDigestItem[]
  topNews: DigestNewsItem[]
  macroNote?: string
}

export const buildPremarketDigestText = (data: PremarketDigestData): string => {
  const watchlistText = data.watchlistItems
    .map(
      (item) =>
        `- ${item.symbol}: $${item.currentPrice?.toFixed(2) ?? 'N/A'} (${(item.changePercent ?? 0) >= 0 ? '+' : ''}${(item.changePercent ?? 0).toFixed(2)}%)`,
    )
    .join('\n')

  const newsText = data.topNews
    .map(
      (n) =>
        `[${n.symbol}] ${n.headline}\n${n.bullets.map((b) => `  * ${b}`).join('\n')}`,
    )
    .join('\n\n')

  return `
StockPros Pre-Market Digest — ${data.dateFormatted}

Good morning ${data.userName},

Here is your daily pre-market briefing and intelligence scan for your tracked watchlist.

YOUR WATCHLIST PERFORMANCE
${watchlistText || 'No active watchlist tickers.'}

TOP WATCHLIST INTELLIGENCE & DEVELOPMENTS
${newsText || 'No major overnight news events detected for your symbols.'}

View live terminal: https://stockpros.com/dashboard
`
}

export const buildPremarketDigestHtml = (data: PremarketDigestData): string => {
  const watchlistRows = data.watchlistItems
    .map((item) => {
      const isPositive = (item.changePercent ?? 0) >= 0
      const color = isPositive ? '#10b981' : '#f43f5e'
      const sign = isPositive ? '+' : ''
      const priceStr =
        item.currentPrice !== null ? `$${item.currentPrice.toFixed(2)}` : '—'
      const pctStr =
        item.changePercent !== null
          ? `${sign}${item.changePercent.toFixed(2)}%`
          : '—'

      return `
      <tr>
        <td style="padding: 10px 14px; border-bottom: 1px solid #242938; font-family: monospace; font-weight: 700; color: #f8fafc;">
          ${item.symbol}
        </td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #242938; text-align: right; color: #cbd5e1; font-family: monospace;">
          ${priceStr}
        </td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #242938; text-align: right; font-weight: 700; color: ${color}; font-family: monospace;">
          ${pctStr}
        </td>
      </tr>
      `
    })
    .join('')

  const newsSections = data.topNews
    .map((article) => {
      const sentimentColor =
        article.sentiment === 'BULLISH'
          ? '#10b981'
          : article.sentiment === 'BEARISH'
            ? '#f43f5e'
            : '#94a3b8'

      const bulletsHtml =
        article.bullets.length > 0
          ? article.bullets
              .map(
                (bullet) =>
                  `<li style="margin-bottom: 4px; color: #cbd5e1; font-size: 13px; line-height: 1.5;">${bullet}</li>`,
              )
              .join('')
          : `<li style="color: #94a3b8; font-size: 13px;">Market coverage in progress.</li>`

      return `
      <div style="background-color: #0f1422; border: 1px solid #1e293b; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px;">
        <div style="margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
          <span style="background-color: rgba(6, 182, 212, 0.15); border: 1px solid rgba(6, 182, 212, 0.3); color: #22d3ee; font-family: monospace; font-weight: 700; font-size: 11px; padding: 2px 8px; rounded: 4px;">
            ${article.symbol}
          </span>
          ${
            article.sentiment
              ? `<span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${sentimentColor}; margin-left: 8px;">
                  ● ${article.sentiment}
                </span>`
              : ''
          }
        </div>
        <h4 style="margin: 0 0 8px 0; color: #f8fafc; font-size: 14px; font-weight: 600; line-height: 1.4;">
          ${article.headline}
        </h4>
        <ul style="margin: 0; padding-left: 18px;">
          ${bulletsHtml}
        </ul>
      </div>
      `
    })
    .join('')

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StockPros Pre-Market Digest</title>
  </head>
  <body style="background-color: #07090e; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 24px 12px;">
    <table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #0b0f19; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
      <!-- Header -->
      <tr>
        <td style="padding: 24px 28px; border-bottom: 1px solid #1e293b; background: linear-gradient(180deg, #0e1526 0%, #0b0f19 100%);">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <img src="cid:logo" alt="StockPros" style="width: 36px; height: 36px; vertical-align: middle; margin-right: 10px;" />
                <span style="font-size: 22px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px; vertical-align: middle;">
                  Stock<span style="color: #22d3ee;">Pros</span>
                </span>
              </td>
              <td align="right">
                <span style="font-size: 11px; font-family: monospace; color: #94a3b8; background: #1e293b; padding: 4px 10px; border-radius: 9999px;">
                  ${data.dateFormatted}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding: 28px;">
          <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: #ffffff;">
            Good Morning, ${data.userName}
          </h2>
          <p style="margin: 0 0 24px 0; font-size: 14px; color: #94a3b8; line-height: 1.5;">
            Here is your daily pre-market digest with overnight moves and key news highlights for your watched tickers.
          </p>

          <!-- Watchlist Table -->
          <div style="margin-bottom: 28px;">
            <div style="margin-bottom: 10px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #38bdf8;">
              Watchlist Scan
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f1422; border: 1px solid #1e293b; border-radius: 10px; border-collapse: separate; overflow: hidden;">
              <thead>
                <tr style="background-color: #161e31;">
                  <th style="padding: 8px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 600;">Ticker</th>
                  <th style="padding: 8px 14px; text-align: right; font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 600;">Price</th>
                  <th style="padding: 8px 14px; text-align: right; font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 600;">24h Chg</th>
                </tr>
              </thead>
              <tbody>
                ${watchlistRows || '<tr><td colspan="3" style="padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">No active watchlist symbols found.</td></tr>'}
              </tbody>
            </table>
          </div>

          <!-- Intelligence & Bullets Section -->
          <div style="margin-bottom: 24px;">
            <div style="margin-bottom: 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #38bdf8;">
              Key Catalysts & News Bullets
            </div>
            ${newsSections || '<p style="color: #94a3b8; font-size: 13px;">No major overnight news events detected for your symbols.</p>'}
          </div>

          <!-- Terminal CTA Button -->
          <div style="text-align: center; margin: 32px 0 16px 0;">
            <a href="https://stockpros.com/dashboard" style="background: linear-gradient(135deg, #0284c7 0%, #06b6d4 100%); color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 10px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 4px 14px rgba(6, 182, 212, 0.4);">
              Launch Terminal Dashboard &rarr;
            </a>
          </div>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding: 20px 28px; background-color: #070a12; border-top: 1px solid #1e293b; text-align: center; font-size: 11px; color: #64748b; line-height: 1.6;">
          &copy; ${new Date().getFullYear()} StockPros Terminal. All rights reserved.<br>
          You received this email because you opted into the Daily Pre-Market Digest in your StockPros terminal settings.
        </td>
      </tr>
    </table>
  </body>
</html>
`
}
