import { UserStatus } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { UnauthorizedError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { refreshAccessToken } from './service'

jest.mock('../../shared/infrastructure/database', () => ({
  prisma: {
    userSession: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}))

describe('Auth Service - refreshAccessToken (Refresh Token Rotation)', () => {
  const userId = 'user-uuid-123'
  const oldJti = 'old-jti-456'
  const validSecret = 'test-refresh-secret'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rotates both access token and refresh token for a valid session', async () => {
    const validRefreshToken = jwt.sign(
      { sub: userId, jti: oldJti },
      validSecret,
      { expiresIn: '7d' },
    )

    const mockSession = {
      id: 'session-id-1',
      userId,
      jti: oldJti,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      user: {
        id: userId,
        status: UserStatus.ACTIVE,
      },
    }

    ;(prisma.userSession.findUnique as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.userSession.update as jest.Mock).mockResolvedValue({
      ...mockSession,
      jti: 'new-jti',
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

    // Ensure prisma.userSession.update was called with session.id and the new jti
    expect(prisma.userSession.update).toHaveBeenCalledWith({
      where: { id: mockSession.id },
      data: expect.objectContaining({
        jti: decoded.jti,
        expiresAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    })
  })

  it('throws UnauthorizedError if session does not exist in DB', async () => {
    const validRefreshToken = jwt.sign(
      { sub: userId, jti: oldJti },
      validSecret,
      { expiresIn: '7d' },
    )

    ;(prisma.userSession.findUnique as jest.Mock).mockResolvedValue(null)

    await expect(refreshAccessToken(validRefreshToken)).rejects.toThrow(
      UnauthorizedError,
    )
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
      jti: oldJti,
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
      jti: oldJti,
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
