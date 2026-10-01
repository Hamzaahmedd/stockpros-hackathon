const mockPrisma: any = {
  userSession: { findUnique: jest.fn(), updateMany: jest.fn() },
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const mockWarn = jest.fn()
jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: { warn: (...args: unknown[]) => mockWarn(...args) },
}))

import config from '@/config'
import { EventEmitter } from 'node:events'
import { StepUpRequiredError, UnauthorizedError } from '../../../shared/errors'
import { requireStepUp } from '../step-up'

const SESSION = 'session-1'
const MINUTE = 60_000

const setConfig = (enabled: boolean, windowMinutes = 15) => {
  const admin = config.admin as {
    stepUpEnabled: boolean
    stepUpWindowMinutes: number
  }
  admin.stepUpEnabled = enabled
  admin.stepUpWindowMinutes = windowMinutes
}
const original = {
  enabled: config.admin.stepUpEnabled,
  window: config.admin.stepUpWindowMinutes,
}
afterEach(() => setConfig(original.enabled, original.window))

const makeRes = (statusCode = 200) =>
  Object.assign(new EventEmitter(), { statusCode }) as any

const run = async (user: object | undefined, res = makeRes()) => {
  const next = jest.fn()
  await requireStepUp({ user } as any, res, next)
  return { next, res, error: next.mock.calls[0]?.[0] }
}

const verifiedAgo = (ms: number) => ({
  stepUpVerifiedAt: new Date(Date.now() - ms),
})

beforeEach(() => {
  jest.clearAllMocks()
  setConfig(true)
  mockPrisma.userSession.updateMany.mockResolvedValue({ count: 1 })
})

describe('requireStepUp', () => {
  it('does nothing when step-up is switched off', async () => {
    setConfig(false)
    const { next, error } = await run({ userId: 'u1' })
    expect(error).toBeUndefined()
    expect(next).toHaveBeenCalledWith()
    expect(mockPrisma.userSession.findUnique).not.toHaveBeenCalled()
  })

  it('asks a legacy token (no session) to sign in again', async () => {
    const { error } = await run({ userId: 'u1' })
    expect(error).toBeInstanceOf(UnauthorizedError)
  })

  it.each([
    ['has never verified', { stepUpVerifiedAt: null }],
    ['verified too long ago', verifiedAgo(16 * MINUTE)],
    ['has no session row', null],
  ])('demands step-up when the staff member %s', async (_label, session) => {
    mockPrisma.userSession.findUnique.mockResolvedValue(session)
    const { error } = await run({ userId: 'u1', sessionId: SESSION })
    expect(error).toBeInstanceOf(StepUpRequiredError)
    expect(error.code).toBe('STEP_UP_REQUIRED')
    expect(error.statusCode).toBe(403)
  })

  it('lets a recently verified session through', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(verifiedAgo(5 * MINUTE))
    const { next, error } = await run({ userId: 'u1', sessionId: SESSION })
    expect(error).toBeUndefined()
    expect(next).toHaveBeenCalledWith()
    expect(mockPrisma.userSession.findUnique).toHaveBeenCalledWith({
      where: { id: SESSION },
      select: { stepUpVerifiedAt: true },
    })
  })

  it('honours the configured window', async () => {
    setConfig(true, 2)
    mockPrisma.userSession.findUnique.mockResolvedValue(verifiedAgo(3 * MINUTE))
    const { error } = await run({ userId: 'u1', sessionId: SESSION })
    expect(error).toBeInstanceOf(StepUpRequiredError)
  })

  describe('sliding window', () => {
    beforeEach(() => {
      mockPrisma.userSession.findUnique.mockResolvedValue(
        verifiedAgo(5 * MINUTE),
      )
    })

    it('extends the window after the action succeeds', async () => {
      const { res } = await run({ userId: 'u1', sessionId: SESSION })
      expect(mockPrisma.userSession.updateMany).not.toHaveBeenCalled()

      res.emit('finish')

      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { id: SESSION },
        data: { stepUpVerifiedAt: expect.any(Date) },
      })
    })

    it('does not extend it when the action failed', async () => {
      const { res } = await run(
        { userId: 'u1', sessionId: SESSION },
        makeRes(500),
      )
      res.emit('finish')
      expect(mockPrisma.userSession.updateMany).not.toHaveBeenCalled()
    })

    it('does not extend it for a rejected request', async () => {
      mockPrisma.userSession.findUnique.mockResolvedValue({
        stepUpVerifiedAt: null,
      })
      const { res } = await run({ userId: 'u1', sessionId: SESSION })
      res.emit('finish')
      expect(mockPrisma.userSession.updateMany).not.toHaveBeenCalled()
    })

    it('logs, rather than fails the request, if extending the window errors', async () => {
      mockPrisma.userSession.updateMany.mockRejectedValue(new Error('db down'))
      const { res } = await run({ userId: 'u1', sessionId: SESSION })

      res.emit('finish')
      await new Promise((resolve) => setImmediate(resolve))

      expect(mockWarn).toHaveBeenCalledWith(
        expect.stringContaining('Could not extend step-up window'),
      )
    })
  })

  it('forwards unexpected database errors', async () => {
    const boom = new Error('db down')
    mockPrisma.userSession.findUnique.mockRejectedValue(boom)
    const { error } = await run({ userId: 'u1', sessionId: SESSION })
    expect(error).toBe(boom)
  })
})
