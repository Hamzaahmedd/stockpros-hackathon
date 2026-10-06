import {
  clientMetadataValidator,
  feedbackIdParamValidator,
  getFeedbackQueryValidator,
  submitFeedbackValidator,
  updateFeedbackStatusValidator,
} from '../validation'

describe('submitFeedbackValidator', () => {
  it('still accepts the original message-and-page body', () => {
    expect(
      submitFeedbackValidator.parse({
        message: ' Great app ',
        page: '/forecast',
      }),
    ).toEqual({ message: 'Great app', page: '/forecast' })
  })

  it('accepts a category and technical context', () => {
    const parsed = submitFeedbackValidator.parse({
      message: 'It broke',
      category: 'BUG',
      metadata: {
        userAgent: 'Mozilla/5.0',
        viewport: { width: 1440, height: 900 },
        appVersion: '1.0.0',
      },
    })
    expect(parsed.category).toBe('BUG')
    expect(parsed.metadata?.viewport).toEqual({ width: 1440, height: 900 })
  })

  it.each(['BUG', 'FEATURE_REQUEST', 'GENERAL'])(
    'accepts category %s',
    (category) => {
      expect(
        submitFeedbackValidator.safeParse({ message: 'x', category }).success,
      ).toBe(true)
    },
  )

  it('rejects an unknown category, a blank message and an oversized message', () => {
    expect(
      submitFeedbackValidator.safeParse({ message: 'x', category: 'RANT' })
        .success,
    ).toBe(false)
    expect(submitFeedbackValidator.safeParse({ message: '   ' }).success).toBe(
      false,
    )
    expect(
      submitFeedbackValidator.safeParse({ message: 'x'.repeat(2001) }).success,
    ).toBe(false)
  })
})

describe('clientMetadataValidator', () => {
  const parse = (metadata: object) =>
    clientMetadataValidator.safeParse(metadata).success

  it('accepts an empty object (every field is optional)', () => {
    expect(parse({})).toBe(true)
  })

  it('refuses a plan tier or any other key the client should not send', () => {
    expect(parse({ planTier: 'TEAM' })).toBe(false)
    expect(parse({ extra: 1 })).toBe(false)
    expect(parse({ viewport: { width: 1, height: 1, dpr: 2 } })).toBe(false)
  })

  it('bounds the user agent, the app version and the viewport', () => {
    expect(parse({ userAgent: 'x'.repeat(300) })).toBe(true)
    expect(parse({ userAgent: 'x'.repeat(301) })).toBe(false)
    expect(parse({ appVersion: 'v'.repeat(41) })).toBe(false)
    expect(parse({ viewport: { width: 0, height: 900 } })).toBe(false)
    expect(parse({ viewport: { width: 20001, height: 900 } })).toBe(false)
    expect(parse({ viewport: { width: 1440.5, height: 900 } })).toBe(false)
    expect(parse({ viewport: { width: 1440 } })).toBe(false)
  })

  it('refuses control characters in text fields', () => {
    expect(parse({ userAgent: 'a\nb' })).toBe(false)
    expect(parse({ appVersion: '1\u0000' })).toBe(false)
  })
})

describe('getFeedbackQueryValidator', () => {
  it('defaults paging and leaves status unset (all statuses)', () => {
    expect(getFeedbackQueryValidator.parse({})).toEqual({ limit: 20 })
  })

  it('accepts a status filter and refuses an unknown one', () => {
    expect(getFeedbackQueryValidator.parse({ status: 'NEW' }).status).toBe(
      'NEW',
    )
    expect(
      getFeedbackQueryValidator.safeParse({ status: 'DONE' }).success,
    ).toBe(false)
  })

  it('bounds the limit and validates the cursor', () => {
    expect(getFeedbackQueryValidator.safeParse({ limit: '101' }).success).toBe(
      false,
    )
    expect(
      getFeedbackQueryValidator.safeParse({ cursor: 'nope' }).success,
    ).toBe(false)
  })
})

describe('status update validators', () => {
  it('needs a uuid and a known status', () => {
    expect(
      feedbackIdParamValidator.safeParse({
        id: '0191e4a0-0000-7000-8000-000000000001',
      }).success,
    ).toBe(true)
    expect(feedbackIdParamValidator.safeParse({ id: 'x' }).success).toBe(false)
    for (const status of ['NEW', 'READ', 'ARCHIVED']) {
      expect(updateFeedbackStatusValidator.safeParse({ status }).success).toBe(
        true,
      )
    }
    expect(
      updateFeedbackStatusValidator.safeParse({ status: 'DELETED' }).success,
    ).toBe(false)
    expect(updateFeedbackStatusValidator.safeParse({}).success).toBe(false)
  })
})
