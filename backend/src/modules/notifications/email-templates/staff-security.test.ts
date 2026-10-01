import {
  buildAdminActionAlertEmail,
  buildAdminActionAlertHtml,
  buildAdminActionAlertSubject,
  buildAdminActionAlertText,
  buildStaffStepUpEmail,
  buildStaffStepUpHtml,
  buildStaffStepUpSubject,
  buildStaffStepUpText,
} from './staff-security'

describe('staff step-up email', () => {
  const data = { code: '482913', expiryMinutes: 5 }

  it('shows the code, its lifetime and a do-not-share warning', () => {
    const text = buildStaffStepUpText(data)
    expect(text).toContain('482913')
    expect(text).toContain('5 minutes')
    expect(text).toContain('do not share this code')
    expect(buildStaffStepUpHtml(data)).toContain('482913')
  })

  it('has a fixed subject and bundles subject, html and text', () => {
    expect(buildStaffStepUpSubject()).toBe(
      'Your StockPros staff verification code',
    )
    expect(Object.keys(buildStaffStepUpEmail(data, 'cid:logo'))).toEqual([
      'subject',
      'html',
      'text',
    ])
  })

  it('uses the supplied logo source', () => {
    expect(
      buildStaffStepUpHtml(data, 'https://cdn.example/logo.png'),
    ).toContain('https://cdn.example/logo.png')
  })
})

describe('admin action alert email', () => {
  const data = {
    action: 'EMERGENCY_MARKET_TOGGLED',
    adminId: 'staff-1',
    targetType: 'SYSTEM',
    targetId: 'market-emergency',
    ticketRef: 'INC-204',
    at: '2026-10-01T10:00:00.000Z',
  }

  it('names the action in the subject', () => {
    expect(buildAdminActionAlertSubject(data)).toBe(
      '[StockPros staff] Emergency market toggled',
    )
  })

  it('lists identifiers, ticket and time in text and html', () => {
    for (const body of [
      buildAdminActionAlertText(data),
      buildAdminActionAlertHtml(data),
    ]) {
      expect(body).toContain('staff-1')
      expect(body).toContain('market-emergency')
      expect(body).toContain('INC-204')
      expect(body).toContain('2026-10-01T10:00:00.000Z')
    }
  })

  it('says "none" when no ticket was given', () => {
    const { ticketRef, ...withoutTicket } = data
    void ticketRef
    expect(buildAdminActionAlertText(withoutTicket)).toContain('Ticket: none')
  })

  it('escapes anything that reaches the html', () => {
    const html = buildAdminActionAlertHtml({
      ...data,
      targetId: '<script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('bundles subject, html and text', () => {
    expect(Object.keys(buildAdminActionAlertEmail(data))).toEqual([
      'subject',
      'html',
      'text',
    ])
  })
})
