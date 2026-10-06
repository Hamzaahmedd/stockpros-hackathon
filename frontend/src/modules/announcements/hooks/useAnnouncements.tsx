import { useAuth } from '@/modules/auth'
import { SocketEvent } from '@/shared/utils/socket-events'
import { socketManager } from '@/shared/utils/socketManager'
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { announcementService } from '../services'
import type { AnnouncementBoot } from '../types'
import { applyAllSeen, applyDismissed, applySeen } from '../utils'

/** Refetch on tab focus at most this often: covers instances that did not receive the socket push. */
export const FOCUS_REFRESH_MIN_INTERVAL_MS = 60_000

export interface AnnouncementsContextValue {
  /** False while the feature is off for this deployment or the user. */
  enabled: boolean
  boot: AnnouncementBoot | null
  dismiss: (id: string) => Promise<void>
  markSeen: (id: string) => Promise<void>
  markAllSeen: () => Promise<void>
  refresh: () => Promise<void>
}

const noop = async (): Promise<void> => undefined

const DISABLED: AnnouncementsContextValue = {
  enabled: false,
  boot: null,
  dismiss: noop,
  markSeen: noop,
  markAllSeen: noop,
  refresh: noop,
}

const AnnouncementsContext = createContext<AnnouncementsContextValue>(DISABLED)

export const AnnouncementsProvider: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  const { user, announcements: initial } = useAuth()
  const userId = user?.userId
  const [boot, setBoot] = useState<AnnouncementBoot | null>(initial)
  const bootRef = useRef(boot)
  bootRef.current = boot
  const lastRefreshAt = useRef(Date.now())
  const enabled = initial !== null && userId !== undefined

  // A new session payload (sign-in, profile refresh) replaces what we hold.
  useEffect(() => {
    setBoot(initial)
    lastRefreshAt.current = Date.now()
  }, [initial])

  const refresh = useCallback(async () => {
    try {
      setBoot(await announcementService.getBoot())
      lastRefreshAt.current = Date.now()
    } catch {
      // Keep showing what we have; the next push or focus tries again.
    }
  }, [])

  // Staff changed something: refetch. The push carries no content.
  useEffect(() => {
    if (!enabled) return
    socketManager.connect()
    socketManager.on(SocketEvent.AnnouncementsChanged, refresh)
    return () => socketManager.off(SocketEvent.AnnouncementsChanged, refresh)
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled) return
    const onVisible = () => {
      const stale =
        Date.now() - lastRefreshAt.current >= FOCUS_REFRESH_MIN_INTERVAL_MS
      if (document.visibilityState === 'visible' && stale) void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [enabled, refresh])

  /** Applies a change immediately and puts things back if the server refuses it. */
  const optimistic = useCallback(
    async (
      apply: (current: AnnouncementBoot) => AnnouncementBoot,
      send: () => Promise<void>,
    ) => {
      const previous = bootRef.current
      if (!previous) return
      setBoot(apply(previous))
      try {
        await send()
      } catch {
        setBoot(previous)
      }
    },
    [],
  )

  const dismiss = useCallback(
    (id: string) =>
      optimistic(
        (current) => applyDismissed(current, id),
        () => announcementService.dismiss(id),
      ),
    [optimistic],
  )

  const markSeen = useCallback(
    (id: string) =>
      optimistic(
        (current) => applySeen(current, id),
        () => announcementService.markSeen(id),
      ),
    [optimistic],
  )

  const markAllSeen = useCallback(
    () => optimistic(applyAllSeen, () => announcementService.markAllSeen()),
    [optimistic],
  )

  const value = useMemo<AnnouncementsContextValue>(
    () => ({ enabled, boot, dismiss, markSeen, markAllSeen, refresh }),
    [enabled, boot, dismiss, markSeen, markAllSeen, refresh],
  )

  return (
    <AnnouncementsContext.Provider value={value}>
      {children}
    </AnnouncementsContext.Provider>
  )
}

/** Safe outside the provider (returns the "feature off" value), so shared components can use it freely. */
// eslint-disable-next-line react-refresh/only-export-components
export const useAnnouncements = (): AnnouncementsContextValue =>
  useContext(AnnouncementsContext)
