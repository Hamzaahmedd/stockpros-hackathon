jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: { teamInvite: { deleteMany: jest.fn() } },
}))

jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: { info: jest.fn() },
}))

import { prisma } from '../../../shared/infrastructure/database'
import { logger } from '../../../shared/infrastructure/logger'
import { runTeamInviteCleanupJob } from '../invite-cleanup-job'
import * as teamsPublic from '../public'

const deleteMany = (prisma as any).teamInvite.deleteMany as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('runTeamInviteCleanupJob', () => {
  it('deletes only invites that have already expired and returns how many', async () => {
    deleteMany.mockResolvedValue({ count: 3 })
    const now = new Date('2026-10-01T07:30:00Z')

    await expect(runTeamInviteCleanupJob(now)).resolves.toBe(3)

    // `lte now` — a still-valid invite (expiresAt in the future) is never touched.
    expect(deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: now } },
    })
  })

  it('defaults to the current time', async () => {
    deleteMany.mockResolvedValue({ count: 0 })
    const before = Date.now()

    await runTeamInviteCleanupJob()

    const { expiresAt } = deleteMany.mock.calls[0][0].where
    expect(expiresAt.lte.getTime()).toBeGreaterThanOrEqual(before)
  })

  it("logs only a count — never the invitees' email addresses (PII)", async () => {
    deleteMany.mockResolvedValue({ count: 2 })

    await runTeamInviteCleanupJob()

    const message = (logger.info as jest.Mock).mock.calls[0][0] as string
    expect(message).toContain('2')
    expect(message).not.toMatch(/@/)
  })

  it('is quiet when there is nothing to clean', async () => {
    deleteMany.mockResolvedValue({ count: 0 })
    await runTeamInviteCleanupJob()
    expect(logger.info).not.toHaveBeenCalled()
  })
})

describe('teams public surface', () => {
  it('exposes the cleanup job for the scheduler, and nothing internal', () => {
    expect(Object.keys(teamsPublic)).toEqual(['runTeamInviteCleanupJob'])
  })
})
