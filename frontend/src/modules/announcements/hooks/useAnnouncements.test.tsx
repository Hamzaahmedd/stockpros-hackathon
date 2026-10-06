import { act, render, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootWithChangelog, makeAnnouncement, makeBoot } from '../test-fixtures'
import type { AnnouncementBoot } from '../types'

const service = vi.hoisted(() => ({
  getBoot: vi.fn(),
  dismiss: vi.fn(),
  markSeen: vi.fn(),
  markAllSeen: vi.fn(),
}))
vi.mock('../services', () => ({ announcementService: service }))

const auth = vi.hoisted(() => ({
  current: {
    user: { userId: 'user-1' } as { userId: string } | null,
    announcements: null as AnnouncementBoot | null,
  },
}))
vi.mock('@/modules/auth', () => ({ useAuth: () => auth.current }))

const socket = vi.hoisted(() => ({
  handlers: new Map<string, (payload?: unknown) => void>(),
  connect: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}))
vi.mock('@/shared/utils/socketManager', () => ({
  socketManager: {
    connect: socket.connect,
    on: (event: string, fn: (payload?: unknown) => void) => {
      socket.handlers.set(event, fn)
      socket.on(event, fn)
    },
    off: (event: string, fn: unknown) => {
      socket.handlers.delete(event)
      socket.off(event, fn)
    },
  },
}))

import { SocketEvent } from '@/shared/utils/socket-events'
import {
  AnnouncementsProvider,
  FOCUS_REFRESH_MIN_INTERVAL_MS,
  useAnnouncements,
} from './useAnnouncements'

const wrapper = ({ children }: { children: ReactNode }) => (
  <AnnouncementsProvider>{children}</AnnouncementsProvider>
)

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.clearAllMocks()
  socket.handlers.clear()
  service.getBoot.mockResolvedValue(makeBoot())
  service.dismiss.mockResolvedValue(undefined)
  service.markSeen.mockResolvedValue(undefined)
  service.markAllSeen.mockResolvedValue(undefined)
  auth.current = { user: { userId: 'user-1' }, announcements: null }
})

afterEach(() => {
  vi.useRealTimers()
  setVisibility('visible')
})

describe('without a provider or while the feature is off', () => {
  it('is safely disabled outside a provider', () => {
    const { result } = renderHook(() => useAnnouncements())
    expect(result.current.enabled).toBe(false)
    expect(result.current.boot).toBeNull()
  })

  it('is disabled when the server sent no announcements, and never touches the socket', () => {
    const { result } = renderHook(() => useAnnouncements(), { wrapper })
    expect(result.current.enabled).toBe(false)
    expect(socket.connect).not.toHaveBeenCalled()
  })

  it('is disabled when nobody is signed in', () => {
    auth.current = { user: null, announcements: makeBoot() }
    const { result } = renderHook(() => useAnnouncements(), { wrapper })
    expect(result.current.enabled).toBe(false)
  })
})

describe('with announcements', () => {
  const modal = makeAnnouncement()
  const other = makeAnnouncement()

  beforeEach(() => {
    auth.current = {
      user: { userId: 'user-1' },
      announcements: bootWithChangelog([modal, other], { modal }),
    }
  })

  it('exposes the boot payload and listens for staff changes', () => {
    const { result } = renderHook(() => useAnnouncements(), { wrapper })
    expect(result.current.enabled).toBe(true)
    expect(result.current.boot?.modal?.id).toBe(modal.id)
    expect(socket.connect).toHaveBeenCalled()
    expect(socket.handlers.has(SocketEvent.AnnouncementsChanged)).toBe(true)
  })

  it('stops listening on unmount', () => {
    const { unmount } = renderHook(() => useAnnouncements(), { wrapper })
    unmount()
    expect(socket.handlers.has(SocketEvent.AnnouncementsChanged)).toBe(false)
  })

  it('picks up a new session payload', () => {
    const { result, rerender } = renderHook(() => useAnnouncements(), {
      wrapper,
    })
    auth.current = {
      user: { userId: 'user-1' },
      announcements: makeBoot({ banner: other }),
    }
    rerender()
    expect(result.current.boot?.banner?.id).toBe(other.id)
    expect(result.current.boot?.modal).toBeNull()
  })

  it('dismisses optimistically and tells the server', async () => {
    const { result } = renderHook(() => useAnnouncements(), { wrapper })

    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.dismiss(modal.id)
    })
    expect(result.current.boot?.modal).toBeNull()
    expect(result.current.boot?.changelog.unreadCount).toBe(1)

    await act(async () => pending)
    expect(service.dismiss).toHaveBeenCalledWith(modal.id)
  })

  it('puts the announcement back when the server refuses the dismissal', async () => {
    service.dismiss.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useAnnouncements(), { wrapper })

    await act(async () => result.current.dismiss(modal.id))

    expect(result.current.boot?.modal?.id).toBe(modal.id)
    expect(result.current.boot?.changelog.unreadCount).toBe(2)
  })

  it('marks one entry and then everything as read', async () => {
    const { result } = renderHook(() => useAnnouncements(), { wrapper })

    await act(async () => result.current.markSeen(other.id))
    expect(service.markSeen).toHaveBeenCalledWith(other.id)
    expect(result.current.boot?.changelog.unreadCount).toBe(1)

    await act(async () => result.current.markAllSeen())
    expect(service.markAllSeen).toHaveBeenCalledTimes(1)
    expect(result.current.boot?.changelog.unreadCount).toBe(0)
  })

  it('rolls back a failed mark-all-read', async () => {
    service.markAllSeen.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useAnnouncements(), { wrapper })

    await act(async () => result.current.markAllSeen())
    expect(result.current.boot?.changelog.unreadCount).toBe(2)
  })

  it('refetches when staff change something', async () => {
    const fresh = makeBoot({ banner: other })
    service.getBoot.mockResolvedValue(fresh)
    const { result } = renderHook(() => useAnnouncements(), { wrapper })

    await act(async () => {
      socket.handlers.get(SocketEvent.AnnouncementsChanged)?.()
    })

    await waitFor(() => expect(result.current.boot).toEqual(fresh))
  })

  it('keeps what it has when a refetch fails', async () => {
    service.getBoot.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useAnnouncements(), { wrapper })

    await act(async () => result.current.refresh())
    expect(result.current.boot?.modal?.id).toBe(modal.id)
  })

  it('does nothing when asked to act before a payload exists', async () => {
    auth.current = { user: { userId: 'user-1' }, announcements: null }
    const { result } = renderHook(() => useAnnouncements(), { wrapper })
    await act(async () => result.current.dismiss('x'))
    expect(service.dismiss).not.toHaveBeenCalled()
  })

  describe('refetch on focus', () => {
    it('refetches a stale tab when it becomes visible again', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      renderHook(() => useAnnouncements(), { wrapper })

      vi.setSystemTime(Date.now() + FOCUS_REFRESH_MIN_INTERVAL_MS + 1)
      await act(async () => setVisibility('visible'))

      expect(service.getBoot).toHaveBeenCalledTimes(1)
    })

    it('does not refetch a fresh tab, or one that is hidden', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      renderHook(() => useAnnouncements(), { wrapper })

      await act(async () => setVisibility('visible'))
      expect(service.getBoot).not.toHaveBeenCalled()

      vi.setSystemTime(Date.now() + FOCUS_REFRESH_MIN_INTERVAL_MS + 1)
      await act(async () => setVisibility('hidden'))
      expect(service.getBoot).not.toHaveBeenCalled()
    })
  })
})

describe('provider rendering', () => {
  it('renders its children', () => {
    const { getByText } = render(
      <AnnouncementsProvider>
        <span>child</span>
      </AnnouncementsProvider>,
    )
    expect(getByText('child')).toBeInTheDocument()
  })
})
