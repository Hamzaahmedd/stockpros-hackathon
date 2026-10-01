const mockPrisma: any = {
  user: { findUnique: jest.fn() },
  adminStepUp: {
    findFirst: jest.fn(),
    create: jest.fn((args: unknown) => ({ __op: 'create', args })),
    update: jest.fn((args: unknown) => ({ __op: 'update', args })),
    updateMany: jest.fn((args: unknown) => ({ __op: 'updateMany', args })),
    deleteMany: jest.fn(),
  },
  userSession: {
    update: jest.fn((args: unknown) => ({ __op: 'session', args })),
  },
  $transaction: jest.fn(),
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const mockEnqueue = jest.fn()
jest.mock('../../notifications/public', () => ({
  enqueueStaffStepUpEmail: (...args: unknown[]) => mockEnqueue(...args),
}))

const mockLogger = { info: jest.fn(), warn: jest.fn() }
jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: mockLogger,
}))

import {
  NotFoundError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../../shared/errors'
import { hashToken } from '../../../shared/utils'
import { requestStepUp, verifyStepUp } from '../step-up-service'

const actor = { userId: 'staff-1', sessionId: 'session-1' }
const CODE = '482913'

const challenge = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  codeHash: hashToken(CODE),
  attempts: 0,
  expiresAt: new Date(Date.now() + 60_000),
  consumedAt: null,
  createdAt: new Date(),
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.user.findUnique.mockResolvedValue({
    email: 'staff@venturedive.com',
  })
  mockPrisma.adminStepUp.findFirst.mockResolvedValue(null)
  mockPrisma.$transaction.mockResolvedValue([])
  mockEnqueue.mockResolvedValue(true)
})

describe('requestStepUp', () => {
  it('stores only a hash of a fresh 6-digit code and emails the code', async () => {
    const result = await requestStepUp(actor)

    expect(result).toEqual({ expiresInSeconds: 300 })
    const created = mockPrisma.adminStepUp.create.mock.calls[0][0].data
    const sent = mockEnqueue.mock.calls[0][0]
    expect(sent).toMatchObject({
      to: 'staff@venturedive.com',
      userId: 'staff-1',
      expiryMinutes: 5,
    })
    expect(sent.code).toMatch(/^\d{6}$/)
    expect(created.codeHash).toBe(hashToken(sent.code))
    expect(created.codeHash).not.toContain(sent.code)
    expect(created).toMatchObject({ userId: 'staff-1', sessionId: 'session-1' })
    expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now() + 290_000)
  })

  it('retires any earlier live code for the session in the same transaction', async () => {
    await requestStepUp(actor)
    expect(mockPrisma.adminStepUp.updateMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-1', consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    })
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('never logs the code or the address', async () => {
    await requestStepUp(actor)
    const logged = JSON.stringify(mockLogger.info.mock.calls)
    expect(logged).not.toContain(mockEnqueue.mock.calls[0][0].code)
    expect(logged).not.toContain('staff@venturedive.com')
  })

  it('enforces the resend cooldown', async () => {
    mockPrisma.adminStepUp.findFirst.mockResolvedValue({
      createdAt: new Date(),
    })
    await expect(requestStepUp(actor)).rejects.toBeInstanceOf(
      TooManyRequestsError,
    )
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('allows a resend after the cooldown', async () => {
    mockPrisma.adminStepUp.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 61_000),
    })
    await expect(requestStepUp(actor)).resolves.toBeDefined()
  })

  it('cleans up and reports 503 when the email could not be queued', async () => {
    mockEnqueue.mockResolvedValue(false)
    await expect(requestStepUp(actor)).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    )
    expect(mockPrisma.adminStepUp.deleteMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-1', consumedAt: null },
    })
  })

  it('404s for an unknown user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    await expect(requestStepUp(actor)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('verifyStepUp', () => {
  it('accepts the right code: consumes it and starts the session window', async () => {
    mockPrisma.adminStepUp.findFirst.mockResolvedValue(challenge())

    const result = await verifyStepUp(actor, CODE)

    expect(new Date(result.verifiedUntil).getTime()).toBeGreaterThan(
      Date.now() + 14 * 60_000,
    )
    expect(mockPrisma.adminStepUp.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { consumedAt: expect.any(Date) },
    })
    expect(mockPrisma.userSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { stepUpVerifiedAt: expect.any(Date) },
    })
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('looks only at this session’s newest unused code', async () => {
    mockPrisma.adminStepUp.findFirst.mockResolvedValue(challenge())
    await verifyStepUp(actor, CODE)
    expect(mockPrisma.adminStepUp.findFirst).toHaveBeenCalledWith({
      where: { sessionId: 'session-1', consumedAt: null },
      orderBy: { createdAt: 'desc' },
    })
  })

  it('counts a wrong code against the attempt cap and logs a warning', async () => {
    mockPrisma.adminStepUp.findFirst.mockResolvedValue(challenge())
    mockPrisma.adminStepUp.update.mockResolvedValueOnce({ attempts: 1 })

    await expect(verifyStepUp(actor, '000000')).rejects.toBeInstanceOf(
      UnauthorizedError,
    )

    expect(mockPrisma.adminStepUp.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    })
    expect(mockPrisma.userSession.update).not.toHaveBeenCalled()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Admin] step-up code rejected',
      { userId: 'staff-1', attempts: 1 },
    )
  })

  it('refuses even the right code once attempts are exhausted', async () => {
    mockPrisma.adminStepUp.findFirst.mockResolvedValue(
      challenge({ attempts: 5 }),
    )
    await expect(verifyStepUp(actor, CODE)).rejects.toBeInstanceOf(
      TooManyRequestsError,
    )
    expect(mockPrisma.userSession.update).not.toHaveBeenCalled()
  })

  it('rejects an expired code', async () => {
    mockPrisma.adminStepUp.findFirst.mockResolvedValue(
      challenge({ expiresAt: new Date(Date.now() - 1) }),
    )
    await expect(verifyStepUp(actor, CODE)).rejects.toThrow(/expired/)
  })

  it('rejects when no code is pending', async () => {
    await expect(verifyStepUp(actor, CODE)).rejects.toThrow(/No pending code/)
  })
})
