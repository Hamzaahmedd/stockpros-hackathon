import config from '@/config'
import {
  isMaskingEnabled,
  maskEmail,
  maskIdentity,
  maskName,
  maskPayload,
  maskPhone,
} from '../masking'

const originalFlag = config.admin.maskCustomerPii
const setMasking = (value: boolean) => {
  ;(config.admin as { maskCustomerPii: boolean }).maskCustomerPii = value
}
afterEach(() => setMasking(originalFlag))

describe('maskEmail', () => {
  it.each([
    ['jane.doe@example.com', 'j***@e***.com'],
    ['a@b.io', 'a***@b***.io'],
    ['first.last@mail.corp.co.uk', 'f***@m***.uk'],
    ['user@localhost', 'u***@l***'],
  ])('%s → %s', (input, expected) => {
    expect(maskEmail(input)).toBe(expected)
  })

  it('never leaks the address when it is malformed', () => {
    expect(maskEmail('not-an-email')).toBe('***')
    expect(maskEmail('@nolocal.com')).toBe('***')
  })
})

describe('maskPhone', () => {
  it('keeps only the last four digits', () => {
    expect(maskPhone('+923001234567')).toBe('+********4567')
    expect(maskPhone('03001234567')).toBe('*******4567')
  })

  it('hides very short numbers entirely', () => {
    expect(maskPhone('123')).toBe('***')
  })
})

describe('maskName', () => {
  it('keeps one initial per word', () => {
    expect(maskName('Sam Lee')).toBe('S*** L***')
    expect(maskName('  Ada   Lovelace ')).toBe('A*** L***')
  })
})

describe('maskIdentity', () => {
  const person = { id: 'u1', email: 'sam@fund.com', displayName: 'Sam Lee' }

  it('masks email and name when masking is on', () => {
    setMasking(true)
    expect(maskIdentity(person)).toEqual({
      id: 'u1',
      email: 's***@f***.com',
      displayName: 'S*** L***',
      piiMasked: true,
    })
  })

  it('handles a missing name', () => {
    setMasking(true)
    expect(
      maskIdentity({ ...person, displayName: null }).displayName,
    ).toBeNull()
  })

  it('passes values through and says so when masking is off', () => {
    setMasking(false)
    expect(isMaskingEnabled()).toBe(false)
    expect(maskIdentity(person)).toEqual({ ...person, piiMasked: false })
  })
})

describe('maskPayload', () => {
  const payload = {
    data: {
      token: 'trk_1',
      customer: { email: 'jane@example.com', phone: '+923001234567' },
      note: 'paid by jane@example.com',
    },
  }

  it('scrubs emails and phone numbers anywhere in the document', () => {
    setMasking(true)
    const masked = JSON.stringify(maskPayload(payload))
    expect(masked).not.toContain('jane@example.com')
    expect(masked).not.toContain('+923001234567')
    expect(masked).toContain('[redacted-email]')
    expect(masked).toContain('trk_1')
  })

  it('leaves the payload alone when masking is off, and tolerates null', () => {
    setMasking(false)
    expect(maskPayload(payload)).toBe(payload)
    setMasking(true)
    expect(maskPayload(null)).toBeNull()
    expect(maskPayload(undefined)).toBeUndefined()
  })
})
