jest.mock('../database', () => ({
  prisma: { $queryRaw: jest.fn() },
}))

jest.mock('../logger', () => ({
  logger: { error: jest.fn() },
}))

import { prisma } from '../database'
import { logger } from '../logger'
import { healthCheckHandler } from '../health'

const mockQueryRaw = prisma.$queryRaw as unknown as jest.Mock

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

beforeEach(() => jest.clearAllMocks())

describe('healthCheckHandler — liveness (default)', () => {
  it('always returns 200 without touching the database', async () => {
    const req = { query: {} } as any
    const res = mockRes()

    await healthCheckHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok' }),
    )
    expect(mockQueryRaw).not.toHaveBeenCalled()
  })

  it('treats any non-"deep" query type as a liveness check', async () => {
    const req = { query: { type: 'shallow' } } as any
    const res = mockRes()

    await healthCheckHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockQueryRaw).not.toHaveBeenCalled()
  })
})

describe('healthCheckHandler — deep readiness', () => {
  it('returns 200 with database connected when the query succeeds in time', async () => {
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }])
    const req = { query: { type: 'deep' } } as any
    const res = mockRes()

    await healthCheckHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok', database: 'connected' }),
    )
  })

  it('returns 503 and logs an Error message when the query rejects', async () => {
    mockQueryRaw.mockRejectedValue(new Error('connection refused'))
    const req = { query: { type: 'deep' } } as any
    const res = mockRes()

    await healthCheckHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unhealthy' }),
    )
    expect(logger.error).toHaveBeenCalledWith(
      'Deep health check failed:',
      'connection refused',
    )
  })

  it('logs the raw rejection value when it is not an Error instance', async () => {
    mockQueryRaw.mockRejectedValue('some string rejection')
    const req = { query: { type: 'deep' } } as any
    const res = mockRes()

    await healthCheckHandler(req, res)

    expect(logger.error).toHaveBeenCalledWith(
      'Deep health check failed:',
      'some string rejection',
    )
  })

  it('returns 503 when the database query hangs past the 2s timeout', async () => {
    jest.useFakeTimers()
    mockQueryRaw.mockReturnValue(new Promise(() => {}))
    const req = { query: { type: 'deep' } } as any
    const res = mockRes()

    const handlerPromise = healthCheckHandler(req, res)
    jest.advanceTimersByTime(2000)
    await handlerPromise

    expect(res.status).toHaveBeenCalledWith(503)
    jest.useRealTimers()
  })
})
