import { getPakistanYear } from '../../../shared/utils'

/**
 * Which of the three renewal states this reminder is for — drives the
 * subject/CTA copy per the design spec:
 *   - card-on:  auto-renew is ON, card will be silently charged
 *   - card-off: auto-renew is OFF, plan will lapse unless re-enabled
 *   - wallet:   JazzCash/Easypaisa — no auto-renew capability at all,
 *               always a manual pay-to-extend action
 */
export type RenewalReminderVariant = 'card-on' | 'card-off' | 'wallet'

export interface RenewalReminderData {
  userName: string
  /** Pre-formatted amount, e.g. "Rs 5,999". */
  amount: string
  /** Pre-formatted date, e.g. "Oct 15, 2026". */
  renewsOn: string
  manageUrl: string
  variant: RenewalReminderVariant
}

const COPY: Record<
  RenewalReminderVariant,
  {
    subject: string
    ctaLabel: string
    body: (d: RenewalReminderData) => string
  }
> = {
  'card-on': {
    subject: 'Upcoming Renewal: Your Pro Plan bills in 3 days',
    ctaLabel: 'Manage Subscription',
    body: (d) =>
      `Your saved card will be charged ${d.amount} on ${d.renewsOn} to renew your StockPros Pro plan.`,
  },
  'card-off': {
    subject: 'Your Pro Plan Access Expires in 3 Days',
    ctaLabel: 'Turn Auto-Renewal Back On',
    body: (d) =>
      `Your plan will revert to Free on ${d.renewsOn} unless you turn auto-renewal back on.`,
  },
  wallet: {
    subject: 'Renew Your Pro Plan Access (JazzCash/Easypaisa)',
    ctaLabel: 'Pay & Extend for 30 Days',
    body: (d) =>
      `Your Pro plan access expires on ${d.renewsOn}. Renew now to keep your access for another 30 days.`,
  },
}

export const buildRenewalReminderSubject = (
  variant: RenewalReminderVariant,
): string => COPY[variant].subject

export const buildRenewalReminderEmailText = (
  data: RenewalReminderData,
): string => `
StockPros Pro Plan Renewal

Hi ${data.userName},

${COPY[data.variant].body(data)}

${COPY[data.variant].ctaLabel}: ${data.manageUrl}
`

export const buildRenewalReminderEmailHtml = (
  data: RenewalReminderData,
  logoSrc = 'cid:logo',
): string => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${COPY[data.variant].subject}</title>
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

      <p style="color: #e6edf3; font-size: 16px; margin-bottom: 8px;">Hi ${data.userName},</p>
      <p style="color: #8b949e; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        ${COPY[data.variant].body(data)}
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${data.manageUrl}" style="display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #0047ab 100%); color: #ffffff; font-weight: 700; font-size: 16px; text-decoration: none; padding: 14px 32px; border-radius: 8px; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4); text-align: center;">
          ${COPY[data.variant].ctaLabel}
        </a>
      </div>

      <!-- Footer -->
      <p style="color: #6e7681; font-size: 12px; margin: 0; text-align: center; border-top: 1px solid #30363d; padding-top: 20px;">
        &copy; ${getPakistanYear()} StockPros. Advanced Market Intelligence &amp; Analytics.
      </p>

    </div>
  </body>
</html>
`

// All-in-one export object for Nodemailer / Resend
export const buildRenewalReminderEmail = (
  data: RenewalReminderData,
  logoSrc = 'cid:logo',
) => ({
  subject: buildRenewalReminderSubject(data.variant),
  html: buildRenewalReminderEmailHtml(data, logoSrc),
  text: buildRenewalReminderEmailText(data),
})
