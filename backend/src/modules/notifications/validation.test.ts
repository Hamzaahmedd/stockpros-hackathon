import { notificationPreferencesValidator } from './validation'

const validPreferences = {
  marketInterests: ['ai_tech', 'growth'],
  inAppAlertsEnabled: true,
  emailVolatilityAlertsEnabled: false,
  dailyDigestEnabled: true,
}

describe('notificationPreferencesValidator', () => {
  it('accepts the complete persisted preference contract', () => {
    expect(notificationPreferencesValidator.parse(validPreferences)).toEqual(
      validPreferences,
    )
  })

  it('rejects unknown, duplicate, and partial preference values', () => {
    expect(() =>
      notificationPreferencesValidator.parse({
        ...validPreferences,
        marketInterests: ['ai_tech', 'ai_tech'],
      }),
    ).toThrow()
    expect(() =>
      notificationPreferencesValidator.parse({
        ...validPreferences,
        marketInterests: ['unknown_interest'],
      }),
    ).toThrow()
    expect(() => notificationPreferencesValidator.parse({})).toThrow()
  })
})
