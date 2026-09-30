/**
 * logger.ts builds its pino instance and transport list at MODULE LOAD TIME
 * based on config.server.nodeEnv/config.axiom.*, so those branches need a
 * fresh module load per test (jest.doMock + jest.resetModules), same as
 * security.test.ts. The formatError/redaction logic, once loaded, is plain
 * synchronous code exercised directly through logger.error(msg, err).
 */

const mockPinoLogger = () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
})

const loadLogger = (
  configOverrides: {
    nodeEnv?: string
    axiomToken?: string
    axiomDataset?: string
  } = {},
) => {
  jest.resetModules()

  const pinoInstance = mockPinoLogger()
  const pinoMock = jest.fn().mockReturnValue(pinoInstance) as jest.Mock & {
    transport: jest.Mock
  }
  pinoMock.transport = jest.fn().mockReturnValue('transport-stream')

  jest.doMock('pino', () => ({ __esModule: true, default: pinoMock }))
  jest.doMock('@/config', () => ({
    __esModule: true,
    config: {
      server: {
        nodeEnv: configOverrides.nodeEnv ?? 'test',
        logLevel: 'info',
      },
      axiom: {
        token: configOverrides.axiomToken,
        dataset: configOverrides.axiomDataset,
      },
    },
  }))

  const { logger } = require('../logger')
  return { logger, pinoInstance, pinoMock }
}

describe('transport selection at load time', () => {
  it('uses only the stdout transport outside production', () => {
    const { pinoMock } = loadLogger({
      nodeEnv: 'development',
      axiomToken: 'tok',
      axiomDataset: 'ds',
    })
    const { targets } = pinoMock.transport.mock.calls[0][0]
    expect(targets).toHaveLength(1)
    expect(targets[0].target).toBe('pino/file')
  })

  it('adds the Axiom OTEL transport in production when token and dataset are both set', () => {
    const { pinoMock } = loadLogger({
      nodeEnv: 'production',
      axiomToken: 'my-token',
      axiomDataset: 'my-dataset',
    })
    const { targets } = pinoMock.transport.mock.calls[0][0]
    expect(targets).toHaveLength(2)
    expect(targets[1].target).toBe('pino-opentelemetry-transport')
    expect(
      targets[1].options.logRecordProcessorOptions.exporterOptions
        .protobufExporterOptions.headers.Authorization,
    ).toBe('Bearer my-token')
    expect(
      targets[1].options.logRecordProcessorOptions.exporterOptions
        .protobufExporterOptions.headers['X-Axiom-Dataset'],
    ).toBe('my-dataset')
  })

  it('omits the Axiom transport in production when the token is missing', () => {
    const { pinoMock } = loadLogger({
      nodeEnv: 'production',
      axiomDataset: 'ds',
    })
    expect(pinoMock.transport.mock.calls[0][0].targets).toHaveLength(1)
  })

  it('omits the Axiom transport in production when the dataset is missing', () => {
    const { pinoMock } = loadLogger({
      nodeEnv: 'production',
      axiomToken: 'tok',
    })
    expect(pinoMock.transport.mock.calls[0][0].targets).toHaveLength(1)
  })

  it('configures pino with the redact paths and censor value', () => {
    const { pinoMock } = loadLogger()
    const pinoOptions = pinoMock.mock.calls[0][0]
    expect(pinoOptions.redact.censor).toBe('[REDACTED]')
    expect(pinoOptions.redact.paths).toEqual(
      expect.arrayContaining(['*.password', '*.phoneNumber', '*.otp']),
    )
  })
})

describe('logger — simple pass-through methods', () => {
  it('passes debug/info/warn messages straight through', () => {
    const { logger, pinoInstance } = loadLogger()
    logger.debug('a debug message')
    logger.info('an info message')
    logger.warn('a warn message')
    expect(pinoInstance.debug).toHaveBeenCalledWith('a debug message')
    expect(pinoInstance.info).toHaveBeenCalledWith('an info message')
    expect(pinoInstance.warn).toHaveBeenCalledWith('a warn message')
  })

  it('logs a bare message with no error object when none is given', () => {
    const { logger, pinoInstance } = loadLogger()
    logger.error('something failed')
    expect(pinoInstance.error).toHaveBeenCalledWith('something failed')
  })
})

describe('logger.error — formatError branches', () => {
  const errorArgOf = (pinoInstance: ReturnType<typeof mockPinoLogger>) =>
    (pinoInstance.error as jest.Mock).mock.calls[0][0].error as string

  it('formats a native Error using its stack trace', () => {
    const { logger, pinoInstance } = loadLogger()
    const err = new Error('boom')
    logger.error('failed', err)
    expect(errorArgOf(pinoInstance)).toBe(err.stack)
  })

  it('falls back to the message when a native Error has no stack', () => {
    const { logger, pinoInstance } = loadLogger()
    const err = new Error('boom')
    delete (err as any).stack
    logger.error('failed', err)
    expect(errorArgOf(pinoInstance)).toBe('boom')
  })

  it("formats an Axios error using the response body's detail field", () => {
    const { logger, pinoInstance } = loadLogger()
    logger.error('failed', {
      isAxiosError: true,
      message: 'Request failed',
      config: { method: 'post', url: 'https://ml.internal/api/v1/forecast' },
      response: {
        status: 422,
        statusText: 'Unprocessable',
        data: { detail: 'bad input' },
      },
    })
    expect(errorArgOf(pinoInstance)).toBe(
      '[AxiosError] POST https://ml.internal/api/v1/forecast -> 422 Unprocessable: bad input',
    )
  })

  it("falls back to the response body's title field when detail is absent", () => {
    const { logger, pinoInstance } = loadLogger()
    logger.error('failed', {
      isAxiosError: true,
      message: 'Request failed',
      response: { status: 400, data: { title: 'Bad Request' } },
    })
    expect(errorArgOf(pinoInstance)).toContain(': Bad Request')
  })

  it("falls back to the Axios error's own message when the body has neither detail nor title", () => {
    const { logger, pinoInstance } = loadLogger()
    logger.error('failed', {
      isAxiosError: true,
      message: 'socket hang up',
      response: { status: 500, data: {} },
    })
    expect(errorArgOf(pinoInstance)).toContain(': socket hang up')
  })

  it('defaults method to REQ and status to ERR when the Axios error has no response/config', () => {
    const { logger, pinoInstance } = loadLogger()
    logger.error('failed', { isAxiosError: true, message: 'network error' })
    expect(errorArgOf(pinoInstance)).toBe(
      '[AxiosError] REQ  -> ERR : network error',
    )
  })

  it('redacts a token query parameter out of the request URL', () => {
    const { logger, pinoInstance } = loadLogger()
    logger.error('failed', {
      isAxiosError: true,
      message: 'unauthorized',
      config: {
        url: 'https://api.example.com/data?apiKey=super-secret-value&x=1',
      },
    })
    expect(errorArgOf(pinoInstance)).toContain('apiKey=[REDACTED]')
    expect(errorArgOf(pinoInstance)).not.toContain('super-secret-value')
  })

  it('redacts sensitive keys but keeps ordinary ones when stringifying a plain thrown object', () => {
    const { logger, pinoInstance } = loadLogger()
    logger.error('failed', {
      password: 'hunter2',
      apikey: 'sk-123',
      authorization: 'Bearer xyz',
      cookie: 'session=abc',
      secret: 'shh',
      phone: '03001234567',
      otp: '123456',
      code: '999999',
      symbol: 'AAPL',
    })
    const formatted = errorArgOf(pinoInstance)
    expect(formatted).not.toContain('hunter2')
    expect(formatted).not.toContain('sk-123')
    expect(formatted).not.toContain('03001234567')
    expect(formatted).toContain('AAPL')
  })

  it('falls back to a placeholder when the thrown object cannot be serialized (circular reference)', () => {
    const { logger, pinoInstance } = loadLogger()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    logger.error('failed', circular)
    expect(errorArgOf(pinoInstance)).toBe('[Unserializable Object]')
  })

  it('stringifies a primitive thrown value', () => {
    const { logger, pinoInstance } = loadLogger()
    logger.error('failed', 42)
    expect(errorArgOf(pinoInstance)).toBe('42')
  })

  it('falls back to an empty string for a value of an unhandled type', () => {
    const { logger, pinoInstance } = loadLogger()
    logger.error('failed', Symbol('weird'))
    expect(errorArgOf(pinoInstance)).toBe('')
  })
})

// Makes this file a module so its top-level helpers do not collide with other
// import-less test files in the shared ts-jest program (TS2451).
export {}

describe('logger — PII scrubbing backstop and structured context', () => {
  it.each(['debug', 'info', 'warn'] as const)(
    '%s scrubs email addresses out of the message',
    (level) => {
      const { logger, pinoInstance } = loadLogger()
      logger[level]('mail to person@fund.com failed (+923001234567)')
      expect(pinoInstance[level]).toHaveBeenCalledWith(
        'mail to [redacted-email] failed ([redacted-phone])',
      )
    },
  )

  it.each(['debug', 'info', 'warn'] as const)(
    '%s passes structured context as the merge object and scrubs string values in it',
    (level) => {
      const { logger, pinoInstance } = loadLogger()
      logger[level]('Sent', {
        jobId: 'job-1',
        attempts: 2,
        ok: true,
        note: 'echoed person@fund.com',
        missing: undefined,
      })
      expect(pinoInstance[level]).toHaveBeenCalledWith(
        {
          jobId: 'job-1',
          attempts: 2,
          ok: true,
          note: 'echoed [redacted-email]',
          missing: undefined,
        },
        'Sent',
      )
    },
  )

  it('error scrubs the message and the formatted error, and merges context', () => {
    const { logger, pinoInstance } = loadLogger()
    logger.error(
      'delivery to person@fund.com failed',
      new Error('550 <person@fund.com> rejected'),
      { jobId: 'job-9', to: 'person@fund.com' },
    )

    const [fields, message] = pinoInstance.error.mock.calls[0]
    expect(message).toBe('delivery to [redacted-email] failed')
    expect(fields.jobId).toBe('job-9')
    expect(fields.to).toBe('[redacted-email]')
    expect(fields.error).toContain('[redacted-email]')
    expect(fields.error).not.toContain('person@fund.com')
  })

  it('error with context but no error object logs the context', () => {
    const { logger, pinoInstance } = loadLogger()
    logger.error('Dropped', undefined, { jobId: 'job-2' })
    expect(pinoInstance.error).toHaveBeenCalledWith(
      { jobId: 'job-2' },
      'Dropped',
    )
  })

  it('does not treat version strings in stack traces as addresses', () => {
    const { logger, pinoInstance } = loadLogger()
    logger.info('loaded pkg@1.2.3 from node_modules/@scope/pkg')
    expect(pinoInstance.info).toHaveBeenCalledWith(
      'loaded pkg@1.2.3 from node_modules/@scope/pkg',
    )
  })

  it('also redacts contact-detail keys by name via pino redact paths', () => {
    const { pinoMock } = loadLogger()
    const { redact } = pinoMock.mock.calls[0][0]
    expect(redact.paths).toEqual(
      expect.arrayContaining([
        'email',
        '*.email',
        'to',
        '*.to',
        'recipient',
        '*.recipient',
      ]),
    )
  })
})
