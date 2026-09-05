// Pakistan Standard Time (PKT, UTC+5) — used for all human-readable timestamps in emails
const PKT_TIMEZONE = 'Asia/Karachi'

const getPKTPart = (date: Date, type: Intl.DateTimeFormatPartTypes): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: PKT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(date)
    .find((part) => part.type === type)?.value ?? ''

const getFormattedTimestamp = (): string => {
  const now = new Date()

  const year = getPKTPart(now, 'year')
  const month = getPKTPart(now, 'month')
  const day = getPKTPart(now, 'day')
  const hours = getPKTPart(now, 'hour')
  const minutes = getPKTPart(now, 'minute')
  const seconds = getPKTPart(now, 'second')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

export const buildMagicLinkSubject = (): string =>
  `Log in to StockPros [${getFormattedTimestamp()}]`

export const buildMagicLinkEmailText = (
  link: string,
  expiryMinutes = 10,
): string => `
StockPros Login Request

Click or copy the link below into your browser to log in to your StockPros account:

${link}

Important Security Information:
- This link is valid for ${expiryMinutes} minutes only.
- This link can only be used once.
- If you did not request this login link, you can safely ignore this email. No action is required.
`

export const buildMagicLinkEmailHtml = (
  link: string,
  expiryMinutes = 10,
  logoSrc = 'cid:logo',
): string => {
  const antiTrimmingToken = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Log in to StockPros</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 20px; background-color: #0d1117; color: #e6edf3;">
    <div style="background-color: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 36px 28px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">

      <!-- Header -->
      <div style="text-align: left; margin-bottom: 28px;">
        <img src="${logoSrc}" alt="StockPros Logo" style="width: 42px; height: 42px; margin-right: 12px; vertical-align: middle; border-radius: 8px; display: inline-block;" />
        <span style="font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; vertical-align: middle; display: inline-block;">
          Stock<span style="color: #06b6d4;">Pros</span>
        </span>
      </div>

      <p style="color: #8b949e; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        We received a request to log in to your StockPros account. Click the secure button below to sign in instantly:
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${link}" style="display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #0047ab 100%); color: #ffffff; font-weight: 700; font-size: 16px; text-decoration: none; padding: 14px 32px; border-radius: 8px; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4); text-align: center;">
          Continue to StockPros
        </a>
      </div>

      <!-- Expiration Note -->
      <div style="background-color: #1f242c; border-left: 3px solid #06b6d4; padding: 12px 16px; border-radius: 4px; margin-bottom: 28px;">
        <p style="color: #c9d1d9; font-size: 13px; margin: 0; line-height: 1.5;">
          This login link will expire in <strong>${expiryMinutes} minutes</strong> and can only be used once. If you did not request this email, no further action is required.
        </p>
      </div>

      <!-- Footer -->
      <p style="color: #6e7681; font-size: 12px; margin: 0; text-align: center; border-top: 1px solid #30363d; padding-top: 20px;">
        &copy; ${getPKTPart(new Date(), 'year')} StockPros. Advanced Market Intelligence &amp; Analytics.
      </p>

      <!-- Invisible dynamic token preventing Gmail footer collapse -->
      <span style="display: none !important; opacity: 0; color: transparent; height: 0; width: 0; font-size: 0px;">
        [${antiTrimmingToken}]
      </span>

    </div>
  </body>
</html>
`
}

// All-in-one export object for Nodemailer / Resend
export const buildMagicLinkEmail = (
  link: string,
  expiryMinutes = 10,
  logoSrc = 'cid:logo',
) => ({
  subject: buildMagicLinkSubject(),
  html: buildMagicLinkEmailHtml(link, expiryMinutes, logoSrc),
  text: buildMagicLinkEmailText(link, expiryMinutes),
})
