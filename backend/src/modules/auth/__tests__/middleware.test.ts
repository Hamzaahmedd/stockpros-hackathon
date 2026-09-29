jest.mock('../utils/jwt', () => ({
  verifyAccessToken: jest.fn(),
}))

jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: { userSession: { findUnique: jest.fn() } },
}))

import { prisma } from '../../../shared/infrastructure/database'
import { authTokenMiddleware } from '../middleware'
import { verifyAccessToken } from '../utils/jwt'

const mockVerifyAccessToken = verifyAccessToken as jest.Mock
const mockFindUnique = prisma.userSession.findUnique as jest.Mock

const mockReq = (authorization?: string) =>
  ({ headers: { authorization }, user: undefined }) as any
const mockRes = () => ({}) as any

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

describe('authTokenMiddleware — no session lookup needed', () => {
  it('defaults to the FREE plan and attaches the user when the token has no jti', async () => {
    mockVerifyAccessToken.mockReturnValue({ sub: 'user-1' })
    const req = mockReq('Bearer t1')
    const next = jest.fn()

    await authTokenMiddleware(req, mockRes(), next)

    expect(req.user).toEqual({ userId: 'user-1', jti: undefined, plan: 'FREE' })
    expect(mockFindUnique).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })
})

describe('authTokenMiddleware — session validation', () => {
  it('attaches the session plan and calls next on a valid session', async () => {
    mockVerifyAccessToken.mockReturnValue({ sub: 'user-1', jti: 'jti-1' })
    mockFindUnique.mockResolvedValue({
      isRevoked: false,
      expiresAt: new Date(Date.now() + 100000),
      user: { plan: 'PRO' },
    })
    const req = mockReq('Bearer t1')
    const next = jest.fn()

    await authTokenMiddleware(req, mockRes(), next)

    expect(req.user).toEqual({ userId: 'user-1', jti: 'jti-1', plan: 'PRO' })
    expect(next).toHaveBeenCalledWith()
  })

  it('calls next with an error when the session does not exist', async () => {
    mockVerifyAccessToken.mockReturnValue({ sub: 'user-1', jti: 'jti-1' })
    mockFindUnique.mockResolvedValue(null)
    const next = jest.fn()

    await authTokenMiddleware(mockReq('Bearer t1'), mockRes(), next)

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Session expired or revoked' }),
    )
  })

  it('calls next with an error when the session is revoked', async () => {
    mockVerifyAccessToken.mockReturnValue({ sub: 'user-1', jti: 'jti-1' })
    mockFindUnique.mockResolvedValue({
      isRevoked: true,
      expiresAt: new Date(Date.now() + 100000),
      user: { plan: 'FREE' },
    })
    const next = jest.fn()

    await authTokenMiddleware(mockReq('Bearer t1'), mockRes(), next)

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Session expired or revoked' }),
    )
  })

  it('calls next with an error when the session has expired', async () => {
    mockVerifyAccessToken.mockReturnValue({ sub: 'user-1', jti: 'jti-1' })
    mockFindUnique.mockResolvedValue({
      isRevoked: false,
      expiresAt: new Date(Date.now() - 1000),
      user: { plan: 'FREE' },
    })
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
    mockVerifyAccessToken.mockReturnValue({ sub: 'user-1', jti: 'jti-1' })
    const dbError = new Error('db down')
    mockFindUnique.mockRejectedValue(dbError)
    const next = jest.fn()

    await authTokenMiddleware(mockReq('Bearer t1'), mockRes(), next)

    expect(next).toHaveBeenCalledWith(dbError)
  })
})
