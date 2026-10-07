import geoip from 'geoip-lite'
import { UAParser } from 'ua-parser-js'
import { NotFoundError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'

/** A signed-in device as shown on the user's "Active sessions" list. */
export interface ActiveSessionView {
  id: string
  /** e.g. "Chrome (Windows)"; "Unknown device" when the user agent is unreadable. */
  device: string
  /** e.g. "Karachi, Sindh, PK"; null when the IP cannot be resolved. */
  location: string | null
  createdAt: Date
  updatedAt: Date
  /** True for the session making this request. */
  isCurrent: boolean
}

const UNKNOWN_DEVICE = 'Unknown device'

export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return UNKNOWN_DEVICE
  const { browser, os } = new UAParser(userAgent).getResult()
  if (!browser.name) return os.name ?? UNKNOWN_DEVICE
  return os.name ? `${browser.name} (${os.name})` : browser.name
}

export function describeLocation(ipAddress: string | null): string | null {
  if (!ipAddress) return null
  const geo = geoip.lookup(ipAddress)
  if (!geo) return null
  const parts = [geo.city, geo.region, geo.country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

/** The caller's live (not revoked, not expired) sessions, newest activity first. */
export async function listActiveSessions(
  userId: string,
  currentSessionId?: string,
): Promise<ActiveSessionView[]> {
  const sessions = await prisma.userSession.findMany({
    where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return sessions.map((s) => ({
    id: s.id,
    device: describeDevice(s.userAgent),
    location: describeLocation(s.ipAddress),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    isCurrent: s.id === currentSessionId,
  }))
}

/** Revokes one of the caller's own sessions; ids belonging to anyone else are indistinguishable from missing. */
export async function revokeSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  const { count } = await prisma.userSession.updateMany({
    where: { id: sessionId, userId, isRevoked: false },
    data: { isRevoked: true },
  })
  if (count === 0) throw new NotFoundError('Session not found')
  logger.info('User revoked a session', { userId, sessionId })
}

/** Signs the caller out everywhere except the session making this request. */
export async function revokeOtherSessions(
  userId: string,
  currentSessionId?: string,
): Promise<number> {
  const { count } = await prisma.userSession.updateMany({
    where: {
      userId,
      isRevoked: false,
      ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
    },
    data: { isRevoked: true },
  })
  logger.info('User revoked their other sessions', { userId, count })
  return count
}
