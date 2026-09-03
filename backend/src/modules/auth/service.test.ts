import { UserStatus } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { UnauthorizedError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { hashToken } from '../../shared/utils'
import { refreshAccessToken } from './service'

jest.mock('../../shared/infrastructure/database', () => ({
  prisma: {
    userSession: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}))

describe('Auth Service - refreshAccessToken (Refresh Token Rotation)', () => {
  const userId = 'user-uuid-123'
  const oldJti = 'old-jti-456'
  const oldJtiHash = hashToken(oldJti)
  const validSecret = 'test-refresh-secret'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rotates both access token and refresh token, hashing the new jti in DB', async () => {
    const validRefreshToken = jwt.sign(
      { sub: userId, jti: oldJti },
      validSecret,
      { expiresIn: '7d' },
    )

    const mockSession = {
      id: 'session-id-1',
      userId,
      jti: oldJtiHash,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      user: {
        id: userId,
        status: UserStatus.ACTIVE,
      },
    }

    ;(prisma.userSession.findUnique as jest.Mock).mockImplementation(
      ({ where }) => {
        if (where.jti === oldJtiHash) return Promise.resolve(mockSession)
        return Promise.resolve(null)
      },
    )
    ;(prisma.userSession.update as jest.Mock).mockResolvedValue({
      ...mockSession,
      jti: 'new-hashed-jti',
    })

    const result = await refreshAccessToken(validRefreshToken)

    expect(result).toHaveProperty('accessToken')
    expect(result).toHaveProperty('refreshToken')
    expect(typeof result.accessToken).toBe('string')
    expect(typeof result.refreshToken).toBe('string')

    // Decode new refresh token and check it has a new jti
    const decoded = jwt.decode(result.refreshToken) as {
      sub: string
      jti: string
    }
    expect(decoded.sub).toBe(userId)
    expect(decoded.jti).not.toBe(oldJti)

    // Ensure prisma.userSession.update was called with hashed jti and old hash in userAgent
    expect(prisma.userSession.update).toHaveBeenCalledWith({
      where: { id: mockSession.id },
      data: expect.objectContaining({
        jti: hashToken(decoded.jti),
        userAgent: oldJtiHash,
        expiresAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    })
  })

  it('handles multi-tab concurrency within the 30s grace window without logging out', async () => {
    const validRefreshToken = jwt.sign(
      { sub: userId, jti: oldJti },
      validSecret,
      { expiresIn: '7d' },
    )

    // Session lookup by current hash returns null (already rotated by first tab)
    ;(prisma.userSession.findUnique as jest.Mock).mockResolvedValue(null)

    // Grace window lookup finds the recently rotated session by previous hash
    const recentSession = {
      id: 'session-id-1',
      userId,
      jti: 'already-rotated-hash',
      userAgent: oldJtiHash,
      isRevoked: false,
      updatedAt: new Date(),
      user: {
        id: userId,
        status: UserStatus.ACTIVE,
      },
    }
    ;(prisma.userSession.findFirst as jest.Mock).mockResolvedValue(
      recentSession,
    )

    const result = await refreshAccessToken(validRefreshToken)

    expect(result).toHaveProperty('accessToken')
    expect(result).toHaveProperty('refreshToken')
    expect(result.refreshToken).toBe(validRefreshToken)
  })

  it('revokes all user sessions when token reuse / breach is detected outside grace window', async () => {
    const stolenRefreshToken = jwt.sign(
      { sub: userId, jti: oldJti },
      validSecret,
      { expiresIn: '7d' },
    )

    ;(prisma.userSession.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.userSession.findFirst as jest.Mock).mockResolvedValue(null)

    await expect(refreshAccessToken(stolenRefreshToken)).rejects.toThrow(
      UnauthorizedError,
    )

    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    })
  })

  it('throws UnauthorizedError if session is revoked', async () => {
    const validRefreshToken = jwt.sign(
      { sub: userId, jti: oldJti },
      validSecret,
      { expiresIn: '7d' },
    )

    const mockSession = {
      id: 'session-id-1',
      userId,
      jti: oldJtiHash,
      isRevoked: true,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      user: {
        id: userId,
        status: UserStatus.ACTIVE,
      },
    }

    ;(prisma.userSession.findUnique as jest.Mock).mockResolvedValue(mockSession)

    await expect(refreshAccessToken(validRefreshToken)).rejects.toThrow(
      UnauthorizedError,
    )
  })

  it('throws UnauthorizedError if user is not ACTIVE', async () => {
    const validRefreshToken = jwt.sign(
      { sub: userId, jti: oldJti },
      validSecret,
      { expiresIn: '7d' },
    )

    const mockSession = {
      id: 'session-id-1',
      userId,
      jti: oldJtiHash,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      user: {
        id: userId,
        status: UserStatus.SUSPENDED,
      },
    }

    ;(prisma.userSession.findUnique as jest.Mock).mockResolvedValue(mockSession)

    await expect(refreshAccessToken(validRefreshToken)).rejects.toThrow(
      UnauthorizedError,
    )
  })
})
