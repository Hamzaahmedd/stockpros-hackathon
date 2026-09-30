import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'

/**
 * Deletes team invites past their expiry. An invite row holds the invitee's
 * email address, so keeping expired ones indefinitely would retain personal
 * data for no purpose (an expired link can never be accepted). Logs only the
 * count, never the addresses.
 */
export const runTeamInviteCleanupJob = async (
  now: Date = new Date(),
): Promise<number> => {
  const { count } = await prisma.teamInvite.deleteMany({
    where: { expiresAt: { lte: now } },
  })
  if (count > 0) {
    logger.info(`[TeamInviteCleanup] Removed ${count} expired invite(s)`)
  }
  return count
}
