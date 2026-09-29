import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  PlanRequiredError,
  QuotaExceededError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../index'

describe('AppError', () => {
  it('sets statusCode, isOperational, name, and prototype chain', () => {
    const err = new AppError('boom', 418, false)
    expect(err.message).toBe('boom')
    expect(err.statusCode).toBe(418)
    expect(err.isOperational).toBe(false)
    expect(err.name).toBe('AppError')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AppError)
  })

  it('defaults isOperational to true', () => {
    expect(new AppError('x', 400).isOperational).toBe(true)
  })
})

describe('AppError subclasses', () => {
  const cases: [new (message?: string) => AppError, number, boolean, string][] =
    [
      [BadRequestError, 400, true, 'Bad Request'],
      [ConflictError, 409, true, 'Conflict'],
      [ForbiddenError, 403, true, 'Forbidden'],
      [InternalServerError, 500, false, 'Internal server error'],
      [NotFoundError, 404, true, 'Resource not found'],
      [TooManyRequestsError, 429, true, 'Too many requests'],
      [UnauthorizedError, 401, true, 'Unauthorized'],
    ]

  it.each(cases)(
    '%p defaults to statusCode %i, isOperational %p, message %p',
    (ErrorClass, statusCode, isOperational, defaultMessage) => {
      const err = new ErrorClass()
      expect(err.statusCode).toBe(statusCode)
      expect(err.isOperational).toBe(isOperational)
      expect(err.message).toBe(defaultMessage)
      expect(err.name).toBe(ErrorClass.name)
      expect(err).toBeInstanceOf(AppError)
    },
  )

  it.each(cases)('%p accepts a custom message', (ErrorClass) => {
    const err = new ErrorClass('custom message')
    expect(err.message).toBe('custom message')
  })
})

describe('PlanRequiredError', () => {
  it('carries the required-plan details for the response body', () => {
    const err = new PlanRequiredError('Upgrade required', {
      requiredPlan: 'PRO',
      reason: 'WATCHLIST_LIMIT',
    })
    expect(err.statusCode).toBe(403)
    expect(err.details).toEqual({
      requiredPlan: 'PRO',
      reason: 'WATCHLIST_LIMIT',
    })
  })
})

describe('QuotaExceededError', () => {
  it('builds its own message from the feature name and carries the quota details', () => {
    const err = new QuotaExceededError({
      feature: 'forecast',
      limit: 10,
      remaining: 0,
      resetAt: '2024-01-02T00:00:00.000Z',
    })
    expect(err.statusCode).toBe(429)
    expect(err.message).toBe('Daily limit reached for forecast')
    expect(err.details.limit).toBe(10)
  })
})
