import { getPakistanYear } from '../../../shared/utils'
import { escapeHtml } from '../../../shared/utils/html'

export interface SpendLimitChangedData {
  userName: string
  /** Pre-formatted, e.g. "Rs 500", or "No limit". */
  previousLimit: string
  /** Pre-formatted, e.g. "Rs 1,200", or "No limit". */
  newLimit: string
  /** Support ticket the change answers, e.g. "SUP-4821". */
  ticketRef: string
  usageUrl: string
}

export const buildSpendLimitChangedSubject = (): string =>
  'Your monthly spending limit was changed by StockPros support'

const summary = (data: SpendLimitChangedData): string =>
  `A StockPros support agent changed the monthly limit on your credit spending from ${data.previousLimit} to ${data.newLimit}, in response to support ticket ${data.ticketRef}.`

const FOLLOW_UP =
  'If you did not ask for this, reply to the support team quoting the ticket above. You can review or change your limit yourself at any time on the usage page.'

export const buildSpendLimitChangedEmailText = (
  data: SpendLimitChangedData,
): string => `
Your spending limit was changed

Hi ${data.userName},

${summary(data)}

${FOLLOW_UP}

Review your limit: ${data.usageUrl}
`

export const buildSpendLimitChangedEmailHtml = (
  data: SpendLimitChangedData,
  logoSrc = 'cid:logo',
): string => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(buildSpendLimitChangedSubject())}</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 20px; background-color: #0d1117; color: #e6edf3;">
    <div style="background-color: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 36px 28px;">
      <div style="text-align: left; margin-bottom: 28px;">
        <img src="${escapeHtml(logoSrc)}" alt="StockPros Logo" style="width: 42px; height: 42px; margin-right: 12px; vertical-align: middle; border-radius: 8px; display: inline-block;" />
        <span style="font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; vertical-align: middle; display: inline-block;">
          Stock<span style="color: #06b6d4;">Pros</span>
        </span>
      </div>

      <p style="color: #e6edf3; font-size: 18px; font-weight: 600; margin-bottom: 8px;">Your spending limit was changed</p>
      <p style="color: #8b949e; font-size: 14px; margin-top: 0;">Hi ${escapeHtml(data.userName)},</p>
      <p style="color: #e6edf3; font-size: 15px; line-height: 1.6;">${escapeHtml(summary(data))}</p>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
        <tr><td style="padding: 6px 0; color: #8b949e; width: 35%;">Previous limit</td><td style="padding: 6px 0;">${escapeHtml(data.previousLimit)}</td></tr>
        <tr><td style="padding: 6px 0; color: #8b949e;">New limit</td><td style="padding: 6px 0;">${escapeHtml(data.newLimit)}</td></tr>
        <tr><td style="padding: 6px 0; color: #8b949e;">Support ticket</td><td style="padding: 6px 0; font-family: monospace;">${escapeHtml(data.ticketRef)}</td></tr>
      </table>

      <p style="color: #8b949e; font-size: 13px; line-height: 1.6;">${escapeHtml(FOLLOW_UP)}</p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${escapeHtml(data.usageUrl)}" style="display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #0047ab 100%); color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 12px 28px; border-radius: 8px;">
          Review your limit
        </a>
      </div>

      <p style="color: #6e7681; font-size: 12px; margin: 0; text-align: center; border-top: 1px solid #30363d; padding-top: 20px;">
        &copy; ${getPakistanYear()} StockPros. Advanced Market Intelligence &amp; Analytics.
      </p>
    </div>
  </body>
</html>
`

export const buildSpendLimitChangedEmail = (
  data: SpendLimitChangedData,
  logoSrc = 'cid:logo',
) => ({
  subject: buildSpendLimitChangedSubject(),
  html: buildSpendLimitChangedEmailHtml(data, logoSrc),
  text: buildSpendLimitChangedEmailText(data),
})
