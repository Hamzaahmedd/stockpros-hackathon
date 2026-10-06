import {
  buildTeamJoinRequestEmail,
  JOIN_REQUEST_EMAIL_KINDS,
  type TeamJoinRequestData,
} from './team-join-request'

const base: Omit<TeamJoinRequestData, 'kind'> = {
  teamName: 'Alpha Fund',
  requesterName: 'Sam Lee',
  actionUrl: 'https://app.example.com/teams',
}

describe('buildTeamJoinRequestEmail', () => {
  it.each(JOIN_REQUEST_EMAIL_KINDS)(
    '%s names the workspace and links to the action',
    (kind) => {
      const { subject, html, text } = buildTeamJoinRequestEmail({
        ...base,
        kind,
      })

      expect(subject).toContain('Alpha Fund')
      expect(text).toContain('Alpha Fund')
      expect(text).toContain(base.actionUrl)
      expect(html).toContain(`href="${base.actionUrl}"`)
    },
  )

  it('tells admins who is asking', () => {
    const { subject, text } = buildTeamJoinRequestEmail({
      ...base,
      kind: 'REQUESTED',
    })

    expect(subject).toContain('Sam Lee')
    expect(text).toContain('Review request')
  })

  it('tells the requester about the decision', () => {
    expect(
      buildTeamJoinRequestEmail({ ...base, kind: 'APPROVED' }).text,
    ).toContain('approved')
    expect(
      buildTeamJoinRequestEmail({ ...base, kind: 'DECLINED' }).text,
    ).toContain('declined')
  })

  it('escapes user-controlled names in the HTML', () => {
    const { html } = buildTeamJoinRequestEmail({
      ...base,
      kind: 'REQUESTED',
      requesterName: '<script>alert(1)</script>',
      teamName: 'A & B "Fund"',
    })

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
  })
})
