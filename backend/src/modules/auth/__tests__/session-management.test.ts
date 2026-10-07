jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    userSession: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}))

import { NotFoundError } from '../../../shared/errors'
import { prisma } from '../../../shared/infrastructure/database'
import {
  describeDevice,
  describeLocation,
  listActiveSessions,
  revokeOtherSessions,
  revokeSession,
} from '../session-management'

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

describe('session-management', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('describeDevice', () => {
    it('combines browser and OS', () => {
      expect(describeDevice(CHROME_WINDOWS)).toBe('Chrome (Windows)')
    })

    it('falls back when the user agent is missing or unreadable', () => {
      expect(describeDevice(null)).toBe('Unknown device')
      expect(describeDevice('???')).toBe('Unknown device')
    })

    it('uses the OS alone when no browser is recognised', () => {
      expect(describeDevice('(Windows NT 10.0; Win64; x64)')).toBe('Windows')
    })
  })

  describe('describeLocation', () => {
    it('is null without an IP or when it cannot be resolved', () => {
      expect(describeLocation(null)).toBeNull()
      expect(describeLocation('127.0.0.1')).toBeNull()
    })

    it('formats city, region and country for a public IP', () => {
      expect(describeLocation('8.8.8.8')).toMatch(/US$/)
    })
  })

  describe('listActiveSessions', () => {
    it('scopes to the user, live sessions only, and flags the current one', async () => {
      const now = new Date()
      ;(prisma.userSession.findMany as jest.Mock).mockResolvedValue([
        {
          id: 's1',
          ipAddress: null,
          userAgent: CHROME_WINDOWS,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 's2',
          ipAddress: null,
          userAgent: null,
          createdAt: now,
          updatedAt: now,
        },
      ])

      const result = await listActiveSessions('u1', 's1')

      expect(prisma.userSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u1',
            isRevoked: false,
            expiresAt: { gt: expect.any(Date) },
          }),
        }),
      )
      expect(result.map((s) => [s.id, s.isCurrent, s.device])).toEqual([
        ['s1', true, 'Chrome (Windows)'],
        ['s2', false, 'Unknown device'],
      ])
    })
  })

  describe('revokeSession', () => {
    it('only revokes a session owned by the caller', async () => {
      ;(prisma.userSession.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      })
      await revokeSession('u1', 's1')
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', userId: 'u1', isRevoked: false },
        data: { isRevoked: true },
      })
    })

    it("treats another user's or unknown session as not found", async () => {
      ;(prisma.userSession.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      })
      await expect(revokeSession('u1', 'other')).rejects.toBeInstanceOf(
        NotFoundError,
      )
    })
  })

  describe('revokeOtherSessions', () => {
    it('spares the current session', async () => {
      ;(prisma.userSession.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      })
      await expect(revokeOtherSessions('u1', 's1')).resolves.toBe(2)
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', isRevoked: false, id: { not: 's1' } },
        data: { isRevoked: true },
      })
    })

    it('revokes everything when the token has no session id', async () => {
      ;(prisma.userSession.updateMany as jest.Mock).mockResolvedValue({
        count: 3,
      })
      await revokeOtherSessions('u1')
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', isRevoked: false },
        data: { isRevoked: true },
      })
    })
  })
})
