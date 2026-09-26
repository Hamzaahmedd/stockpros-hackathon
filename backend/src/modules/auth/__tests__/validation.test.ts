import { otpCodeValidator, phoneNumberValidator } from '../validation'

describe('phoneNumberValidator', () => {
  it('accepts a canonical E.164 Pakistani mobile number', () => {
    expect(
      phoneNumberValidator.parse({ phoneNumber: '+923001234567' }),
    ).toEqual({ phoneNumber: '+923001234567' })
  })

  it('rejects local (unnormalized) input — callers must normalize first', () => {
    expect(() =>
      phoneNumberValidator.parse({ phoneNumber: '03001234567' }),
    ).toThrow()
  })

  it('rejects a no-plus canonical digit string', () => {
    expect(() =>
      phoneNumberValidator.parse({ phoneNumber: '923001234567' }),
    ).toThrow()
  })

  it('rejects non-Pakistani E.164 numbers', () => {
    expect(() =>
      phoneNumberValidator.parse({ phoneNumber: '+14155552671' }),
    ).toThrow()
  })

  it('rejects missing/non-string phoneNumber', () => {
    expect(() => phoneNumberValidator.parse({})).toThrow()
    expect(() => phoneNumberValidator.parse({ phoneNumber: 123 })).toThrow()
  })
})

describe('otpCodeValidator', () => {
  it('accepts a 6-digit code', () => {
    expect(otpCodeValidator.parse({ code: '123456' })).toEqual({
      code: '123456',
    })
  })

  it('trims surrounding whitespace', () => {
    expect(otpCodeValidator.parse({ code: '  123456  ' })).toEqual({
      code: '123456',
    })
  })

  it('rejects codes that are not exactly 6 digits', () => {
    expect(() => otpCodeValidator.parse({ code: '12345' })).toThrow()
    expect(() => otpCodeValidator.parse({ code: '1234567' })).toThrow()
  })

  it('rejects non-numeric codes', () => {
    expect(() => otpCodeValidator.parse({ code: 'abcdef' })).toThrow()
    expect(() => otpCodeValidator.parse({ code: '12a456' })).toThrow()
  })

  it('rejects missing/non-string code', () => {
    expect(() => otpCodeValidator.parse({})).toThrow()
    expect(() => otpCodeValidator.parse({ code: 123456 })).toThrow()
  })
})
