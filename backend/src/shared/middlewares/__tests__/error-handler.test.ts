import { ZodError, z } from 'zod'
import config from '@/config'
import {
  AppError,
  ConflictError,
  FeatureDisabledError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  OverageReason,
  OverageRequiredError,
  PlanRequiredError,
  QuotaExceededError,
  StaffSessionExpiredError,
  StepUpRequiredError,
  ValidationError,
} from '../../errors'
import { errorHandler } from '../error-handler'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

const req = {} as any
const next = jest.fn()

const originalNodeEnv = config.server.nodeEnv
afterEach(() => {
  ;(config.server as any).nodeEnv = originalNodeEnv
})

describe('errorHandler — Axios errors', () => {
  it('extracts a string response body as the message', () => {
    const err = {
      isAxiosError: true,
      response: { status: 502, data: 'upstream ML service is down' },
      message: 'Request failed with status code 502',
    }
    const res = mockRes()
    errorHandler(err, req, res, next)

    expect(res.status).toHaveBeenCalledWith(502)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'upstream ML service is down',
        errorCode: 'ML_SERVICE_ERROR',
      }),
    )
  })

  it('extracts a message field from an object response body', () => {
    const err = {
      isAxiosError: true,
      response: { status: 400, data: { message: 'invalid symbol' } },
    }
    const res = mockRes()
    errorHandler(err, req, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'invalid symbol' }),
    )
  })

  it('falls back to the Axios error message when the response body has no message', () => {
    const err = {
      isAxiosError: true,
      response: { status: 500, data: {} },
      message: 'socket hang up',
    }
    const res = mockRes()
    errorHandler(err, req, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'socket hang up' }),
    )
  })

  it('falls back to a generic message when there is no response and no message', () => {
    const err = { isAxiosError: true }
    const res = mockRes()
    errorHandler(err, req, res, next)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'ML service request failed' }),
    )
  })
})

describe('errorHandler — AppError subclasses', () => {
  it('passes a NotFoundError straight through with its own status and errorCode', () => {
    const res = mockRes()
    errorHandler(new NotFoundError('Widget not found'), req, res, next)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Widget not found',
        errorCode: 'NotFoundError',
      }),
    )
    // sendError omits the `details` key entirely when undefined, rather than
    // including it with an undefined value.
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('details')
  })

  it('omits errorCode for a plain, un-subclassed AppError', () => {
    const res = mockRes()
    errorHandler(new AppError('generic failure', 418), req, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.not.objectContaining({ errorCode: expect.anything() }),
    )
  })

  it('surfaces details for a ValidationError', () => {
    const res = mockRes()
    errorHandler(
      new ValidationError('bad input', { field: 'email' }),
      req,
      res,
      next,
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ details: { field: 'email' } }),
    )
  })

  it('surfaces details for a QuotaExceededError', () => {
    const res = mockRes()
    const err = new QuotaExceededError({
      feature: 'forecast',
      limit: 10,
      resetAt: 'tomorrow',
    } as any)
    errorHandler(err, req, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 429, details: err.details }),
    )
  })

  it('surfaces details for a PlanRequiredError', () => {
    const res = mockRes()
    const err = new PlanRequiredError('Upgrade required', {
      requiredPlan: 'PRO',
    } as any)
    errorHandler(err, req, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, details: err.details }),
    )
  })
})

describe('errorHandler — ZodError', () => {
  it('maps a ZodError to a 400 ValidationError carrying the zod issues', () => {
    const schema = z.object({ email: z.string().email() })
    const result = schema.safeParse({ email: 'not-an-email' })
    expect(result.success).toBe(false)
    const zodError = (result as { success: false; error: ZodError }).error

    const res = mockRes()
    errorHandler(zodError, req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ details: zodError.issues }),
    )
  })
})

describe('errorHandler — unrecognized errors mapped by code', () => {
  const cases: [string, number][] = [
    ['ECONNRESET', 500],
    ['ETIMEDOUT', 500],
    ['P2002', 409],
    ['P2003', 409],
    ['P2025', 404],
    ['P2000', 400],
    ['P2004', 400],
    ['P2033', 400],
    ['23505', 409],
    ['23503', 409],
    ['23502', 400],
    ['22P02', 400],
    ['23514', 400],
    ['P0001', 400],
    ['P2021', 500],
  ]

  it.each(cases)('maps error code %s to status %i', (code, statusCode) => {
    const res = mockRes()
    errorHandler({ code, message: 'db blew up' }, req, res, next)
    expect(res.status).toHaveBeenCalledWith(statusCode)
  })

  it('reads the error code from a nested cause when not present directly', () => {
    const res = mockRes()
    errorHandler(
      { cause: { code: 'P2002' }, message: 'wrapped' },
      req,
      res,
      next,
    )
    expect(res.status).toHaveBeenCalledWith(409)
  })

  it('reads the error code from Prisma-style meta when not present directly', () => {
    const res = mockRes()
    errorHandler(
      { meta: { code: '23503' }, message: 'wrapped' },
      req,
      res,
      next,
    )
    expect(res.status).toHaveBeenCalledWith(409)
  })

  it('falls back to a 500 InternalServerError for a totally unrecognized code', () => {
    const res = mockRes()
    errorHandler(
      { code: 'SOME_MADE_UP_CODE', message: 'weird failure' },
      req,
      res,
      next,
    )
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'weird failure' }),
    )
  })

  it('uses getErrorMessage\'s own "Unknown error" default when the unrecognized error has no message', () => {
    // mapKnownCodeToError's own `fallbackMsg || 'Unexpected database error'`
    // fallback is effectively unreachable via the real entry point: the
    // fallbackMsg it receives always comes from getErrorMessage, which never
    // returns a falsy value (it defaults to 'Unknown error' itself).
    const res = mockRes()
    errorHandler({ code: 'SOME_MADE_UP_CODE' }, req, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Unknown error' }),
    )
  })
})

describe('errorHandler — message extraction', () => {
  it('extracts the quoted message from a wrapped Postgres error string', () => {
    const raw =
      'PrismaClientKnownRequestError: PostgresError { code: "23505", message: "duplicate key value violates unique constraint" }'
    const res = mockRes()
    errorHandler({ message: raw }, req, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'duplicate key value violates unique constraint',
      }),
    )
  })

  it('falls back to the last line of a multi-line stack-trace-style message', () => {
    const raw =
      'Error: something failed\n    at Object.<anonymous> (/app/index.js:1:1)\n    at final line of trace'
    const res = mockRes()
    errorHandler({ message: raw }, req, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: '    at final line of trace' }),
    )
  })

  it('defaults to "Unknown error" when the thrown value has no message at all', () => {
    const res = mockRes()
    errorHandler({}, req, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Unknown error' }),
    )
  })
})

describe('errorHandler — logging behavior', () => {
  it('does not throw when logging a non-operational error outside production', () => {
    ;(config.server as any).nodeEnv = 'development'
    const res = mockRes()
    expect(() =>
      errorHandler(new AppError('boom', 500, false), req, res, next),
    ).not.toThrow()
  })

  it('does not throw (and skips the dev-only log) for a non-operational error in production', () => {
    ;(config.server as any).nodeEnv = 'production'
    const res = mockRes()
    expect(() =>
      errorHandler(new AppError('boom', 500, false), req, res, next),
    ).not.toThrow()
  })
})

describe('errorHandler — OverageRequiredError', () => {
  it('returns 403 with the stable OVERAGE_REQUIRED code and details', () => {
    const res = mockRes()
    errorHandler(
      new OverageRequiredError({
        reason: OverageReason.INSUFFICIENT_CREDITS,
        feature: 'ai_forecast',
        canTopUp: true,
      }),
      req,
      res,
      next,
    )
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'OVERAGE_REQUIRED',
        details: {
          code: 'OVERAGE_REQUIRED',
          reason: 'INSUFFICIENT_CREDITS',
          feature: 'ai_forecast',
          canTopUp: true,
        },
      }),
    )
  })
})

describe('errorHandler — error codes', () => {
  const respond = (err: unknown) => {
    const res = mockRes()
    errorHandler(err, req, res, next)
    return res.json.mock.calls[0][0]
  }

  it.each([
    [
      'FeatureDisabledError',
      new FeatureDisabledError(),
      'FORBIDDEN_FEATURE_DISABLED',
    ],
    ['StepUpRequiredError', new StepUpRequiredError(), 'STEP_UP_REQUIRED'],
    [
      'StaffSessionExpiredError',
      new StaffSessionExpiredError(),
      'STAFF_SESSION_EXPIRED',
    ],
  ])('%s exposes its own code', (_name, error, expected) => {
    expect(respond(error).errorCode).toBe(expected)
  })

  it('still falls back to the class name for errors without a code', () => {
    expect(respond(new ForbiddenError()).errorCode).toBe('ForbiddenError')
  })
})
