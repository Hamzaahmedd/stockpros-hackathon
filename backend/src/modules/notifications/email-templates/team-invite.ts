import { getPakistanYear } from '../../../shared/utils'
import { escapeHtml } from '../../../shared/utils/html'

export interface TeamInviteData {
  inviterName: string
  teamName: string
  inviteUrl: string
  /** Workspace role the invitee will get, e.g. "MEMBER". */
  role: string
  /** ISO 8601 instant (BullMQ serialises Dates to strings). */
  expiresAt: string
}

const roleLabel = (role: string): string => role.toLowerCase()

const formatExpiry = (expiresAt: string): string =>
  new Date(expiresAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

export const buildTeamInviteSubject = (
  data: Pick<TeamInviteData, 'inviterName' | 'teamName'>,
): string =>
  `${data.inviterName} invited you to join ${data.teamName} on StockPros`

export const buildTeamInviteEmailText = (data: TeamInviteData): string => `
You're invited to ${data.teamName}

${data.inviterName} invited you to join the ${data.teamName} workspace on StockPros as ${roleLabel(data.role)}.

Join the team: ${data.inviteUrl}

This invite expires on ${formatExpiry(data.expiresAt)}. Sign in with the email address this invite was sent to.
If you weren't expecting it, you can ignore this email.
`

export const buildTeamInviteEmailHtml = (
  data: TeamInviteData,
  logoSrc = 'cid:logo',
): string => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(buildTeamInviteSubject(data))}</title>
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

      <p style="color: #e6edf3; font-size: 18px; font-weight: 600; margin-bottom: 8px;">
        You're invited to ${escapeHtml(data.teamName)}
      </p>
      <p style="color: #8b949e; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        ${escapeHtml(data.inviterName)} invited you to join the
        <strong style="color: #e6edf3;">${escapeHtml(data.teamName)}</strong>
        workspace on StockPros as ${escapeHtml(roleLabel(data.role))}.
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(data.inviteUrl)}" style="display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #0047ab 100%); color: #ffffff; font-weight: 700; font-size: 16px; text-decoration: none; padding: 14px 32px; border-radius: 8px; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4); text-align: center;">
          Join the Team
        </a>
      </div>

      <p style="color: #8b949e; font-size: 13px; line-height: 1.6; margin-bottom: 24px;">
        This invite expires on ${escapeHtml(formatExpiry(data.expiresAt))}. Sign in with the email address this invite was sent to.
        If you weren't expecting it, you can safely ignore this email.
      </p>

      <!-- Footer -->
      <p style="color: #6e7681; font-size: 12px; margin: 0; text-align: center; border-top: 1px solid #30363d; padding-top: 20px;">
        &copy; ${getPakistanYear()} StockPros. Advanced Market Intelligence &amp; Analytics.
      </p>

    </div>
  </body>
</html>
`

// All-in-one export object for Nodemailer / Resend
export const buildTeamInviteEmail = (
  data: TeamInviteData,
  logoSrc = 'cid:logo',
) => ({
  subject: buildTeamInviteSubject(data),
  html: buildTeamInviteEmailHtml(data, logoSrc),
  text: buildTeamInviteEmailText(data),
})
