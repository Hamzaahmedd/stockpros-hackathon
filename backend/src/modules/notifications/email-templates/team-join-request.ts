import { getPakistanYear } from '../../../shared/utils'
import { escapeHtml } from '../../../shared/utils/html'

/** REQUESTED goes to the workspace admins; APPROVED / DECLINED go to the requester. */
export const JOIN_REQUEST_EMAIL_KINDS = [
  'REQUESTED',
  'APPROVED',
  'DECLINED',
] as const
export type JoinRequestEmailKind = (typeof JOIN_REQUEST_EMAIL_KINDS)[number]

export interface TeamJoinRequestData {
  kind: JoinRequestEmailKind
  teamName: string
  /** Who asked to join (REQUESTED only). */
  requesterName: string
  /** Where the recipient acts: the workspace queue, or the workspace itself. */
  actionUrl: string
}

interface Copy {
  subject: string
  heading: string
  body: string
  cta: string
}

const copyFor = (data: TeamJoinRequestData): Copy => {
  switch (data.kind) {
    case 'REQUESTED':
      return {
        subject: `${data.requesterName} asked to join ${data.teamName} on StockPros`,
        heading: 'New request to join',
        body: `${data.requesterName} asked to join the ${data.teamName} workspace. Review the request to approve or decline it.`,
        cta: 'Review request',
      }
    case 'APPROVED':
      return {
        subject: `You're in: ${data.teamName} approved your request`,
        heading: `Welcome to ${data.teamName}`,
        body: `An admin approved your request to join the ${data.teamName} workspace on StockPros.`,
        cta: 'Open workspace',
      }
    case 'DECLINED':
      return {
        subject: `Your request to join ${data.teamName} was declined`,
        heading: 'Request declined',
        body: `An admin declined your request to join the ${data.teamName} workspace. You can contact them directly if you think this is a mistake.`,
        cta: 'Open StockPros',
      }
  }
}

export const buildTeamJoinRequestEmailText = (
  data: TeamJoinRequestData,
): string => {
  const copy = copyFor(data)
  return `
${copy.heading}

${copy.body}

${copy.cta}: ${data.actionUrl}
`
}

export const buildTeamJoinRequestEmailHtml = (
  data: TeamJoinRequestData,
  logoSrc = 'cid:logo',
): string => {
  const copy = copyFor(data)
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(copy.subject)}</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 20px; background-color: #0d1117; color: #e6edf3;">
    <div style="background-color: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 36px 28px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
      <div style="text-align: left; margin-bottom: 28px;">
        <img src="${logoSrc}" alt="StockPros Logo" style="width: 42px; height: 42px; margin-right: 12px; vertical-align: middle; border-radius: 8px; display: inline-block;" />
        <span style="font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; vertical-align: middle; display: inline-block;">
          Stock<span style="color: #06b6d4;">Pros</span>
        </span>
      </div>
      <p style="color: #e6edf3; font-size: 18px; font-weight: 600; margin-bottom: 8px;">
        ${escapeHtml(copy.heading)}
      </p>
      <p style="color: #8b949e; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        ${escapeHtml(copy.body)}
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(data.actionUrl)}" style="display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #0047ab 100%); color: #ffffff; font-weight: 700; font-size: 16px; text-decoration: none; padding: 14px 32px; border-radius: 8px; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4); text-align: center;">
          ${escapeHtml(copy.cta)}
        </a>
      </div>
      <p style="color: #6e7681; font-size: 12px; margin: 0; text-align: center; border-top: 1px solid #30363d; padding-top: 20px;">
        &copy; ${getPakistanYear()} StockPros. Advanced Market Intelligence &amp; Analytics.
      </p>
    </div>
  </body>
</html>
`
}

export const buildTeamJoinRequestEmail = (
  data: TeamJoinRequestData,
  logoSrc = 'cid:logo',
) => ({
  subject: copyFor(data).subject,
  html: buildTeamJoinRequestEmailHtml(data, logoSrc),
  text: buildTeamJoinRequestEmailText(data),
})
