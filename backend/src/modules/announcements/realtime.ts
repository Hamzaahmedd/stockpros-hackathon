import { SocketEvent } from '../../shared/infrastructure/realtime/socket-events'
import { SocketServer } from '../../shared/infrastructure/realtime/socket-server'
import { logger } from '../../shared/infrastructure/logger'
import { invalidateActiveAnnouncements } from './active-cache'

/**
 * Tells connected clients to refetch. The payload is deliberately empty: what
 * a given user may see is decided by the authenticated API, never by a broadcast.
 * Reaches this instance's sockets only; other instances' clients pick the change
 * up on their next refetch (focus / L1 expiry).
 */
const broadcastAnnouncementsChanged = (): void => {
  try {
    SocketServer.getInstance()?.io.emit(SocketEvent.AnnouncementsChanged, {})
  } catch (err) {
    logger.warn(
      `[Announcements] change broadcast failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/** Call after every committed announcement write: drops the caches, then pushes the change. */
export const announcementsChanged = async (): Promise<void> => {
  await invalidateActiveAnnouncements()
  broadcastAnnouncementsChanged()
}
