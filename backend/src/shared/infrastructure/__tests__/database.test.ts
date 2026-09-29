const mockConnect = jest.fn()

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: mockConnect,
  })),
}))

jest.mock('../logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn() },
}))

import { logger } from '../logger'
import { connectPrismaWithRetry } from '../database'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('connectPrismaWithRetry', () => {
  it('connects successfully on the first attempt', async () => {
    mockConnect.mockResolvedValue(undefined)

    await connectPrismaWithRetry()

    expect(mockConnect).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(
      'Successfully connected to Postgres database.',
    )
  })

  it('retries after a failed attempt and succeeds on the second', async () => {
    jest.useFakeTimers()
    mockConnect
      .mockRejectedValueOnce(new Error('cold start'))
      .mockResolvedValueOnce(undefined)

    const promise = connectPrismaWithRetry(3, 10)
    await jest.runAllTimersAsync()
    await promise

    expect(mockConnect).toHaveBeenCalledTimes(2)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Database connection attempt 1 failed'),
    )
    jest.useRealTimers()
  })

  it('throws the last error once all retries are exhausted', async () => {
    jest.useFakeTimers()
    const finalError = new Error('still down')
    mockConnect.mockRejectedValue(finalError)

    const promise = connectPrismaWithRetry(2, 10)
    const assertion = expect(promise).rejects.toBe(finalError)
    await jest.runAllTimersAsync()
    await assertion

    expect(mockConnect).toHaveBeenCalledTimes(2)
    jest.useRealTimers()
  })
})
