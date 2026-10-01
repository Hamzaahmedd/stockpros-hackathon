import { getPakistanYear } from '../../../shared/utils'
import { escapeHtml } from '../../../shared/utils/html'

/** Shared dark-theme shell for staff security emails (code and alert). */
const wrapSecurityEmail = (
  title: string,
  bodyHtml: string,
  logoSrc: string,
): string => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 20px; background-color: #0d1117; color: #e6edf3;">
    <div style="background-color: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 36px 28px;">
      <div style="margin-bottom: 28px;">
        <img src="${logoSrc}" alt="StockPros Logo" style="width: 42px; height: 42px; margin-right: 12px; vertical-align: middle; border-radius: 8px; display: inline-block;" />
        <span style="font-size: 26px; font-weight: 800; color: #ffffff; vertical-align: middle; display: inline-block;">Stock<span style="color: #06b6d4;">Pros</span></span>
      </div>
      ${bodyHtml}
      <p style="color: #6e7681; font-size: 12px; margin: 24px 0 0; text-align: center; border-top: 1px solid #30363d; padding-top: 20px;">
        &copy; ${getPakistanYear()} StockPros staff operations.
      </p>
    </div>
  </body>
</html>
`

// ─── Step-up code ─────────────────────────────────────────────────────────────

export interface StaffStepUpData {
  code: string
  expiryMinutes: number
}

export const buildStaffStepUpSubject = (): string =>
  'Your StockPros staff verification code'

export const buildStaffStepUpText = (data: StaffStepUpData): string => `
StockPros staff verification

Your code to confirm a sensitive action in the staff panel: ${data.code}

It expires in ${data.expiryMinutes} minutes and can be used once.
If you did not just try to make a change, do not share this code and tell the security team.
`

export const buildStaffStepUpHtml = (
  data: StaffStepUpData,
  logoSrc = 'cid:logo',
): string =>
  wrapSecurityEmail(
    buildStaffStepUpSubject(),
    `<p style="font-size: 18px; font-weight: 600; margin: 0 0 8px;">Confirm a sensitive action</p>
      <p style="color: #8b949e; font-size: 15px; line-height: 1.6;">Enter this code in the staff panel to continue:</p>
      <p style="text-align: center; font-size: 34px; font-weight: 800; letter-spacing: 8px; margin: 24px 0;">${escapeHtml(data.code)}</p>
      <p style="color: #8b949e; font-size: 13px; line-height: 1.6;">It expires in ${data.expiryMinutes} minutes and can be used once. If you did not just try to make a change, do not share this code and tell the security team.</p>`,
    logoSrc,
  )

export const buildStaffStepUpEmail = (
  data: StaffStepUpData,
  logoSrc = 'cid:logo',
) => ({
  subject: buildStaffStepUpSubject(),
  html: buildStaffStepUpHtml(data, logoSrc),
  text: buildStaffStepUpText(data),
})

// ─── Risky-action alert ───────────────────────────────────────────────────────

/** Identifiers only: an alert never carries customer names, emails or free text. */
export interface AdminActionAlertData {
  action: string
  adminId: string
  targetType: string
  targetId: string
  ticketRef?: string
  /** ISO 8601 instant. */
  at: string
}

const label = (value: string): string => {
  const words = value.toLowerCase().replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const buildAdminActionAlertSubject = (
  data: Pick<AdminActionAlertData, 'action'>,
): string => `[StockPros staff] ${label(data.action)}`

const alertRows = (data: AdminActionAlertData): [string, string][] => [
  ['Action', label(data.action)],
  ['Staff member', data.adminId],
  ['Target', `${data.targetType} ${data.targetId}`],
  ['Ticket', data.ticketRef ?? 'none'],
  ['When (UTC)', data.at],
]

export const buildAdminActionAlertText = (data: AdminActionAlertData): string =>
  `
A sensitive staff action was performed.

${alertRows(data)
  .map(([key, value]) => `${key}: ${value}`)
  .join('\n')}

Review it in the staff panel audit log. If it was not expected, revoke the staff member's sessions.
`

export const buildAdminActionAlertHtml = (
  data: AdminActionAlertData,
  logoSrc = 'cid:logo',
): string =>
  wrapSecurityEmail(
    buildAdminActionAlertSubject(data),
    `<p style="font-size: 18px; font-weight: 600; margin: 0 0 16px;">A sensitive staff action was performed</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        ${alertRows(data)
          .map(
            ([key, value]) =>
              `<tr><td style="padding: 6px 0; color: #8b949e; width: 35%;">${escapeHtml(key)}</td><td style="padding: 6px 0; font-family: monospace;">${escapeHtml(value)}</td></tr>`,
          )
          .join('')}
      </table>
      <p style="color: #8b949e; font-size: 13px; line-height: 1.6; margin-top: 20px;">Review it in the staff panel audit log. If it was not expected, revoke the staff member's sessions.</p>`,
    logoSrc,
  )

export const buildAdminActionAlertEmail = (
  data: AdminActionAlertData,
  logoSrc = 'cid:logo',
) => ({
  subject: buildAdminActionAlertSubject(data),
  html: buildAdminActionAlertHtml(data, logoSrc),
  text: buildAdminActionAlertText(data),
})
