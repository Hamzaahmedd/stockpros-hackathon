import { UsageAlertKind } from '@prisma/client'
import { getPakistanYear } from '../../../shared/utils'
import { escapeHtml } from '../../../shared/utils/html'

export interface UsageAlertData {
  kind: UsageAlertKind
  userName: string
  /** Included AI signals used so far this billing cycle. */
  usedSignals: number
  includedSignals: number
  /** Pre-formatted date the allowance resets, e.g. "Oct 15, 2026". */
  resetsOn: string
  /** Pre-formatted credit balance, e.g. "Rs 950". */
  creditBalance: string
  /** Pre-formatted personal spending limit; only for CAP_90. */
  spendLimit?: string
  /** Pre-formatted amount spent against that limit; only for CAP_90. */
  spentSoFar?: string
  usageUrl: string
}

interface Copy {
  subject: string
  headline: string
  body: (data: UsageAlertData) => string
}

const COPY: Record<UsageAlertKind, Copy> = {
  [UsageAlertKind.QUOTA_80]: {
    subject: "You've used 80% of your monthly AI signals",
    headline: 'Your included AI signals are running low',
    body: (d) =>
      `You have used ${d.usedSignals} of your ${d.includedSignals} included AI signals this cycle. They reset on ${d.resetsOn}. After that, each extra signal is paid from your credits (balance: ${d.creditBalance}).`,
  },
  [UsageAlertKind.QUOTA_EXHAUSTED]: {
    subject: "You've used all your included AI signals",
    headline: 'Your included AI signals are used up',
    body: (d) =>
      `All ${d.includedSignals} included AI signals are used until ${d.resetsOn}. From now on each signal is paid from your credits (balance: ${d.creditBalance}).`,
  },
  [UsageAlertKind.LOW_BALANCE]: {
    subject: 'Your AI credit balance is running low',
    headline: 'Your credit balance is running low',
    body: (d) =>
      `Your balance is ${d.creditBalance}. When it cannot cover another signal, forecasts and market decisions will pause until you top up or your allowance resets on ${d.resetsOn}.`,
  },
  [UsageAlertKind.CAP_90]: {
    subject: "You're close to your monthly spending limit",
    headline: "You're close to your spending limit",
    body: (d) =>
      `You have spent ${d.spentSoFar ?? ''} of your ${d.spendLimit ?? ''} monthly limit on credits. Once it is reached, paid AI signals pause until ${d.resetsOn} or until you raise the limit.`,
  },
}

export const buildUsageAlertSubject = (
  data: Pick<UsageAlertData, 'kind'>,
): string => COPY[data.kind].subject

export const buildUsageAlertEmailText = (data: UsageAlertData): string => `
${COPY[data.kind].headline}

Hi ${data.userName},

${COPY[data.kind].body(data)}

See your usage and manage your limits: ${data.usageUrl}

You can turn these emails off on the usage page.
`

export const buildUsageAlertEmailHtml = (
  data: UsageAlertData,
  logoSrc = 'cid:logo',
): string => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(buildUsageAlertSubject(data))}</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 20px; background-color: #0d1117; color: #e6edf3;">
    <div style="background-color: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 36px 28px;">
      <div style="text-align: left; margin-bottom: 28px;">
        <img src="${escapeHtml(logoSrc)}" alt="StockPros Logo" style="width: 42px; height: 42px; margin-right: 12px; vertical-align: middle; border-radius: 8px; display: inline-block;" />
        <span style="font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; vertical-align: middle; display: inline-block;">
          Stock<span style="color: #06b6d4;">Pros</span>
        </span>
      </div>

      <p style="color: #e6edf3; font-size: 18px; font-weight: 600; margin-bottom: 8px;">${escapeHtml(COPY[data.kind].headline)}</p>
      <p style="color: #8b949e; font-size: 14px; margin-top: 0;">Hi ${escapeHtml(data.userName)},</p>
      <p style="color: #e6edf3; font-size: 15px; line-height: 1.6;">${escapeHtml(COPY[data.kind].body(data))}</p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${escapeHtml(data.usageUrl)}" style="display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #0047ab 100%); color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 12px 28px; border-radius: 8px;">
          View usage
        </a>
      </div>

      <p style="color: #6e7681; font-size: 12px; margin: 0; text-align: center; border-top: 1px solid #30363d; padding-top: 20px;">
        You can turn these emails off on the usage page.<br>
        &copy; ${getPakistanYear()} StockPros. Advanced Market Intelligence &amp; Analytics.
      </p>
    </div>
  </body>
</html>
`

export const buildUsageAlertEmail = (
  data: UsageAlertData,
  logoSrc = 'cid:logo',
) => ({
  subject: buildUsageAlertSubject(data),
  html: buildUsageAlertEmailHtml(data, logoSrc),
  text: buildUsageAlertEmailText(data),
})
