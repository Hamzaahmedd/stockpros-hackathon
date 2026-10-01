/**
 * Support-ticket linkage on admin writes: optional unless config demands it,
 * but always format-checked when supplied.
 */
jest.mock('../../payments/public', () => ({ TEAM_MIN_SEATS: 2 }))

import config from '@/config'
import {
  auditLogQueryValidator,
  capacityValidator,
  creditAdjustmentValidator,
  extendSubscriptionValidator,
  marketEmergencyValidator,
  planOverrideValidator,
  reasonBodyValidator,
  ticketRefSchema,
} from '../validation'

const REASON = 'Customer escalation, approved by finance'
const ID = '0191e4a0-0000-7000-8000-000000000001'

/** Every write validator with a valid body, so each can be exercised the same way. */
const WRITES = [
  ['plan override', planOverrideValidator, { plan: 'PRO' }],
  [
    'session invalidation / domain verify / member removal',
    reasonBodyValidator,
    {},
  ],
  ['seat capacity', capacityValidator, { seatCapacity: 400 }],
  [
    'credit adjustment',
    creditAdjustmentValidator,
    { target: 'USER', targetId: ID, amountPaisa: 5000 },
  ],
  [
    'subscription extension',
    extendSubscriptionValidator,
    { currentPeriodEnd: '2030-01-01T00:00:00.000Z' },
  ],
  ['market emergency', marketEmergencyValidator, { closed: true }],
] as const

const originalFlag = config.admin.requireTicketRef
const setRequired = (value: boolean) => {
  ;(config.admin as { requireTicketRef: boolean }).requireTicketRef = value
}
afterEach(() => setRequired(originalFlag))

describe.each(WRITES)('%s — ticketRef', (_label, validator, base) => {
  const parse = (extra: Record<string, unknown>) =>
    validator.safeParse({ ...base, reason: REASON, ...extra })

  describe('when tickets are not required', () => {
    beforeEach(() => setRequired(false))

    it('accepts a body with no ticketRef', () => {
      const result = parse({})
      expect(result.success).toBe(true)
    })

    it('treats a blank form field as absent', () => {
      const result = parse({ ticketRef: '' })
      expect(result.success).toBe(true)
      expect((result.data as { ticketRef?: string }).ticketRef).toBeUndefined()
    })

    it('still rejects a malformed ticketRef', () => {
      expect(parse({ ticketRef: 'not a ticket' }).success).toBe(false)
    })

    it('accepts and trims a well-formed ticketRef', () => {
      const result = parse({ ticketRef: '  SUP-1234  ' })
      expect((result.data as { ticketRef?: string }).ticketRef).toBe('SUP-1234')
    })
  })

  describe('when tickets are required', () => {
    beforeEach(() => setRequired(true))

    it('rejects a missing or blank ticketRef', () => {
      expect(parse({}).success).toBe(false)
      expect(parse({ ticketRef: '' }).success).toBe(false)
    })

    it('accepts a valid ticketRef', () => {
      expect(parse({ ticketRef: 'INC-204' }).success).toBe(true)
    })
  })
})

describe('ticketRef format', () => {
  it.each(['SUP-1', 'AB-12345678', 'INC9-204', 'Z9-0'])(
    'accepts %s',
    (value) => {
      expect(ticketRefSchema.safeParse(value).success).toBe(true)
    },
  )

  it.each([
    'sup-1234', // lowercase key
    'S-1', // key too short
    'TOOLONGKEY1-1', // key too long
    'SUP1234', // no dash
    'SUP-', // no number
    'SUP-123456789', // number too long
    'SUP-12 34',
    '1SUP-12', // key must start with a letter
  ])('rejects %s', (value) => {
    expect(ticketRefSchema.safeParse(value).success).toBe(false)
  })
})

describe('audit-log filter by ticket', () => {
  it('accepts a well-formed ticket and rejects a malformed one', () => {
    expect(
      auditLogQueryValidator.safeParse({ ticketRef: 'SUP-1' }).success,
    ).toBe(true)
    expect(
      auditLogQueryValidator.safeParse({ ticketRef: 'oops' }).success,
    ).toBe(false)
    expect(auditLogQueryValidator.safeParse({}).success).toBe(true)
  })
})
