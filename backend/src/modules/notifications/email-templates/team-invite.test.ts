import {
  buildTeamInviteEmail,
  buildTeamInviteEmailHtml,
  buildTeamInviteEmailText,
  buildTeamInviteSubject,
  type TeamInviteData,
} from './team-invite'

const data: TeamInviteData = {
  inviterName: 'Olivia',
  teamName: 'Alpha Fund',
  inviteUrl: 'https://app.example/teams/invite?token=abc123',
  role: 'ADMIN',
  expiresAt: '2026-10-07T00:00:00.000Z',
}

describe('buildTeamInviteSubject', () => {
  it('names the inviter and the team', () => {
    expect(buildTeamInviteSubject(data)).toBe(
      'Olivia invited you to join Alpha Fund on StockPros',
    )
  })
})

describe('buildTeamInviteEmailText', () => {
  it('contains the CTA link, role and formatted expiry', () => {
    const text = buildTeamInviteEmailText(data)
    expect(text).toContain(
      'Join the team: https://app.example/teams/invite?token=abc123',
    )
    expect(text).toContain('as admin')
    expect(text).toContain('Oct 7, 2026')
  })
})

describe('buildTeamInviteEmailHtml', () => {
  it('renders a responsive page with a Join the Team button pointing at the invite URL', () => {
    const html = buildTeamInviteEmailHtml(data)
    expect(html).toContain('name="viewport"')
    expect(html).toContain(
      'href="https://app.example/teams/invite?token=abc123"',
    )
    expect(html).toContain('Join the Team')
    expect(html).toContain('Alpha Fund')
    expect(html).toContain('src="cid:logo"')
  })

  it('uses a custom logo source when given', () => {
    expect(buildTeamInviteEmailHtml(data, 'https://cdn/logo.png')).toContain(
      'src="https://cdn/logo.png"',
    )
  })

  it('escapes user-controlled names so they cannot inject markup', () => {
    const html = buildTeamInviteEmailHtml({
      ...data,
      inviterName: '<script>alert(1)</script>',
      teamName: 'A "B" & <C>\'s',
      inviteUrl: 'https://x/?a=1&b="2"',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('A &quot;B&quot; &amp; &lt;C&gt;&#39;s')
    expect(html).toContain('href="https://x/?a=1&amp;b=&quot;2&quot;"')
  })
})

describe('buildTeamInviteEmail', () => {
  it('bundles subject, html and text', () => {
    const email = buildTeamInviteEmail(data, 'cid:custom')
    expect(email.subject).toBe(buildTeamInviteSubject(data))
    expect(email.html).toContain('cid:custom')
    expect(email.text).toContain(data.inviteUrl)
  })
})

describe('team invite — shares the common escaper', () => {
  it('escapes the same characters as the shared helper (quotes, ampersands, tags)', () => {
    const html = buildTeamInviteEmailHtml({
      ...data,
      teamName: 'Ann\'s <Fund> & "Co"',
    })
    expect(html).toContain('Ann&#39;s &lt;Fund&gt; &amp; &quot;Co&quot;')
  })
})
