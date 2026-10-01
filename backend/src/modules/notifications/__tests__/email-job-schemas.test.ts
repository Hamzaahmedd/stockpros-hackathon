import {
  alertEmailJobSchema,
  authEmailJobSchema,
  paymentReceiptJobSchema,
  renewalReminderJobSchema,
  teamInviteJobSchema,
} from '../email-job-schemas'

const valid = {
  alert: {
    to: 'a@example.com',
    userId: 'user-1',
    symbol: 'AAPL',
    alertType: 'PRICE_ABOVE',
    title: 't',
    body: 'b',
  },
  auth: {
    to: 'a@example.com',
    loginLink: 'https://app.example/auth/verify?token=abc',
    expiryMinutes: 10,
  },
  renewal: {
    to: 'a@example.com',
    subscriptionId: 'sub-1',
    userName: 'Hamza',
    amount: 'Rs 5,999',
    renewsOn: 'Oct 15, 2026',
    manageUrl: 'https://app.example/plans',
    variant: 'wallet',
  },
  invite: {
    to: 'a@example.com',
    inviteId: 'inv-1',
    teamId: 'team-1',
    inviterName: 'Olivia',
    teamName: 'Alpha Fund',
    inviteUrl: 'https://app.example/teams/invite?token=abc',
    role: 'ADMIN',
    expiresAt: '2026-10-07T00:00:00.000Z',
  },
}

const schemas = [
  ['alert', alertEmailJobSchema],
  ['auth', authEmailJobSchema],
  ['renewal', renewalReminderJobSchema],
  ['invite', teamInviteJobSchema],
] as const

describe.each(schemas)('%s job schema', (name, schema) => {
  it('accepts a well-formed payload', () => {
    expect(schema.safeParse(valid[name]).success).toBe(true)
  })

  it('rejects a missing recipient and a malformed one', () => {
    expect(schema.safeParse({ ...valid[name], to: undefined }).success).toBe(
      false,
    )
    expect(
      schema.safeParse({ ...valid[name], to: 'not-an-email' }).success,
    ).toBe(false)
  })

  it.each([null, undefined, 'text', 42, []])(
    'rejects non-object input %j',
    (input) => {
      expect(schema.safeParse(input).success).toBe(false)
    },
  )
})

describe('link fields only allow http(s) URLs (they become email hrefs)', () => {
  const linkCases = [
    ['auth', authEmailJobSchema, 'loginLink'],
    ['renewal', renewalReminderJobSchema, 'manageUrl'],
    ['invite', teamInviteJobSchema, 'inviteUrl'],
  ] as const

  describe.each(linkCases)('%s.%s', (name, schema, field) => {
    it.each([
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'ftp://files.example/x',
      'file:///etc/passwd',
      'not a url',
      '//evil.example/x',
    ])('rejects %s', (link) => {
      expect(schema.safeParse({ ...valid[name], [field]: link }).success).toBe(
        false,
      )
    })

    it.each([
      'https://app.example/x?y=1',
      'http://localhost:5173/x',
      'HTTPS://APP.EXAMPLE/X',
    ])('accepts %s', (link) => {
      expect(schema.safeParse({ ...valid[name], [field]: link }).success).toBe(
        true,
      )
    })
  })
})

describe('field-specific rules', () => {
  it('alert: only real alert types, and a user id is required for log correlation', () => {
    expect(
      alertEmailJobSchema.safeParse({ ...valid.alert, alertType: 'NOPE' })
        .success,
    ).toBe(false)
    expect(
      alertEmailJobSchema.safeParse({ ...valid.alert, userId: '' }).success,
    ).toBe(false)
  })

  it('renewal: only known variants, and a subscription id is required', () => {
    expect(
      renewalReminderJobSchema.safeParse({
        ...valid.renewal,
        variant: 'lifetime',
      }).success,
    ).toBe(false)
    expect(
      renewalReminderJobSchema.safeParse({
        ...valid.renewal,
        subscriptionId: '',
      }).success,
    ).toBe(false)
  })

  it('invite: role must be a TeamRole, expiry an ISO instant, ids present', () => {
    expect(
      teamInviteJobSchema.safeParse({ ...valid.invite, role: 'ROOT' }).success,
    ).toBe(false)
    expect(
      teamInviteJobSchema.safeParse({ ...valid.invite, expiresAt: 'tomorrow' })
        .success,
    ).toBe(false)
    expect(
      teamInviteJobSchema.safeParse({ ...valid.invite, teamId: '' }).success,
    ).toBe(false)
    expect(
      teamInviteJobSchema.safeParse({ ...valid.invite, inviteId: undefined })
        .success,
    ).toBe(false)
  })

  it('auth: the expiry must be a positive number', () => {
    expect(
      authEmailJobSchema.safeParse({ ...valid.auth, expiryMinutes: 0 }).success,
    ).toBe(false)
    expect(
      authEmailJobSchema.safeParse({ ...valid.auth, expiryMinutes: '10' })
        .success,
    ).toBe(false)
  })
})

describe('paymentReceiptJobSchema', () => {
  const receipt = {
    to: 'billing@fund.com',
    transactionId: 'txn-1',
    teamId: 'team-1',
    teamName: 'Alpha Fund',
    referenceNumber: 'SP-2030-000000C1',
    description: 'Team plan subscription',
    amount: 'Rs 14,998',
    seatCount: 2,
    paidOn: 'Mar 5, 2030',
    manageUrl: 'https://app.example/teams',
  }

  it('accepts a real payload', () => {
    expect(paymentReceiptJobSchema.safeParse(receipt).success).toBe(true)
  })

  it.each([
    ['a non-email recipient', { to: 'nope' }],
    ['a javascript: link', { manageUrl: 'javascript:alert(1)' }],
    ['a zero seat count', { seatCount: 0 }],
    ['a fractional seat count', { seatCount: 1.5 }],
    ['an empty transaction id', { transactionId: '' }],
    ['an empty team id', { teamId: '' }],
  ])('rejects %s', (_label, override) => {
    expect(
      paymentReceiptJobSchema.safeParse({ ...receipt, ...override }).success,
    ).toBe(false)
  })
})
