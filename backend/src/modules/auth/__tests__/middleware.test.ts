jest.mock('../utils/jwt', () => ({
  verifyAccessToken: jest.fn(),
}))

jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    userSession: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}))

import { prisma } from '../../../shared/infrastructure/database'
import { authTokenMiddleware } from '../middleware'
import { verifyAccessToken } from '../utils/jwt'

const mockVerifyAccessToken = verifyAccessToken as jest.Mock
const mockFindSession = prisma.userSession.findUnique as jest.Mock
const mockFindUser = prisma.user.findUnique as jest.Mock

const mockReq = (authorization?: string) =>
  ({ headers: { authorization }, user: undefined }) as any
const mockRes = () => ({}) as any

const liveSession = (overrides: Record<string, unknown> = {}) => ({
  id: 'session-1',
  userId: 'user-1',
  isRevoked: false,
  expiresAt: new Date(Date.now() + 100000),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  user: { plan: 'PRO' },
  ...overrides,
})

beforeEach(() => jest.clearAllMocks())

describe('authTokenMiddleware — missing/malformed token', () => {
  it('calls next with UnauthorizedError when the Authorization header is absent', async () => {
    const next = jest.fn()
    await authTokenMiddleware(mockReq(undefined), mockRes(), next)
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Access token missing' }),
    )
  })

  it('calls next with UnauthorizedError when the header is not a Bearer token', async () => {
    const next = jest.fn()
    await authTokenMiddleware(mockReq('Basic xyz'), mockRes(), next)
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Access token missing' }),
    )
  })
})

describe('authTokenMiddleware — session-bound tokens (sid)', () => {
  beforeEach(() => {
    mockVerifyAccessToken.mockReturnValue({ sub: 'user-1', sid: 'session-1' })
  })

  it('validates the session on every request and attaches session + plan', async () => {
    mockFindSession.mockResolvedValue(liveSession())
    const req = mockReq('Bearer t1')
    const next = jest.fn()

    await authTokenMiddleware(req, mockRes(), next)

    expect(req.user).toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
      sessionCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
      plan: 'PRO',
    })
    expect(next).toHaveBeenCalledWith()
  })

  it('reads only the columns the check needs', async () => {
    mockFindSession.mockResolvedValue(liveSession())
    await authTokenMiddleware(mockReq('Bearer t1'), mockRes(), jest.fn())

    expect(mockFindSession).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      select: {
        id: true,
        userId: true,
        isRevoked: true,
        expiresAt: true,
        createdAt: true,
        user: { select: { plan: true } },
      },
    })
    expect(mockFindUser).not.toHaveBeenCalled()
  })

  it.each([
    ['does not exist', null],
    ['is revoked', liveSession({ isRevoked: true })],
    ['has expired', liveSession({ expiresAt: new Date(Date.now() - 1000) })],
    [
      'belongs to a different user than the token subject',
      liveSession({ userId: 'someone-else' }),
    ],
  ])('rejects when the session %s', async (_label, session) => {
    mockFindSession.mockResolvedValue(session)
    const next = jest.fn()

    await authTokenMiddleware(mockReq('Bearer t1'), mockRes(), next)

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Session expired or revoked' }),
    )
  })

  it('stops honouring a token the moment its session is revoked', async () => {
    mockFindSession.mockResolvedValueOnce(liveSession())
    const first = jest.fn()
    await authTokenMiddleware(mockReq('Bearer t1'), mockRes(), first)
    expect(first).toHaveBeenCalledWith()

    // e.g. staff "invalidate sessions", logout, or breach response
    mockFindSession.mockResolvedValueOnce(liveSession({ isRevoked: true }))
    const second = jest.fn()
    await authTokenMiddleware(mockReq('Bearer t1'), mockRes(), second)
    expect(second).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Session expired or revoked' }),
    )
  })
})

describe('authTokenMiddleware — legacy tokens without sid', () => {
  beforeEach(() => {
    mockVerifyAccessToken.mockReturnValue({ sub: 'user-1' })
  })

  it('still authenticates, reading the plan from the user instead of assuming FREE', async () => {
    mockFindUser.mockResolvedValue({ plan: 'PRO' })
    const req = mockReq('Bearer t1')
    const next = jest.fn()

    await authTokenMiddleware(req, mockRes(), next)

    expect(req.user).toEqual({ userId: 'user-1', plan: 'PRO' })
    expect(mockFindSession).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it('rejects a token for a user that no longer exists', async () => {
    mockFindUser.mockResolvedValue(null)
    const next = jest.fn()

    await authTokenMiddleware(mockReq('Bearer t1'), mockRes(), next)

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Session expired or revoked' }),
    )
  })
})

describe('authTokenMiddleware — JWT verification failures', () => {
  it('rejects with UnauthorizedError for an expired access token', async () => {
    const err = new Error('jwt expired')
    err.name = 'TokenExpiredError'
    mockVerifyAccessToken.mockImplementation(() => {
      throw err
    })

    await expect(
      authTokenMiddleware(mockReq('Bearer t1'), mockRes(), jest.fn()),
    ).rejects.toMatchObject({
      message: 'Authentication required (Token Expired)',
    })
  })

  it('rejects with UnauthorizedError for a malformed JWT', async () => {
    const err = new Error('jwt malformed')
    err.name = 'JsonWebTokenError'
    mockVerifyAccessToken.mockImplementation(() => {
      throw err
    })

    await expect(
      authTokenMiddleware(mockReq('Bearer t1'), mockRes(), jest.fn()),
    ).rejects.toMatchObject({ message: 'Invalid access token' })
  })

  it('rejects with UnauthorizedError for a not-yet-valid JWT (NotBeforeError)', async () => {
    const err = new Error('jwt not active')
    err.name = 'NotBeforeError'
    mockVerifyAccessToken.mockImplementation(() => {
      throw err
    })

    await expect(
      authTokenMiddleware(mockReq('Bearer t1'), mockRes(), jest.fn()),
    ).rejects.toMatchObject({ message: 'Invalid access token' })
  })

  it('forwards any other unexpected error to next()', async () => {
    mockVerifyAccessToken.mockReturnValue({ sub: 'user-1', sid: 'session-1' })
    const dbError = new Error('db down')
    mockFindSession.mockRejectedValue(dbError)
    const next = jest.fn()

    await authTokenMiddleware(mockReq('Bearer t1'), mockRes(), next)

    expect(next).toHaveBeenCalledWith(dbError)
  })
})
