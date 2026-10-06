const mockInvalidate = jest.fn()
jest.mock('../active-cache', () => ({
  invalidateActiveAnnouncements: (...args: unknown[]) =>
    mockInvalidate(...args),
}))

const mockGetInstance = jest.fn()
jest.mock('../../../shared/infrastructure/realtime/socket-server', () => ({
  SocketServer: { getInstance: () => mockGetInstance() },
}))

import { SocketEvent } from '../../../shared/infrastructure/realtime/socket-events'
import { announcementsChanged } from '../realtime'

beforeEach(() => {
  jest.clearAllMocks()
  mockInvalidate.mockResolvedValue(undefined)
})

describe('announcementsChanged', () => {
  it('drops the caches first, then tells every client to refetch with no content', async () => {
    const emit = jest.fn()
    mockGetInstance.mockReturnValue({ io: { emit } })

    await announcementsChanged()

    expect(mockInvalidate).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(SocketEvent.AnnouncementsChanged, {})
    expect(mockInvalidate.mock.invocationCallOrder[0]).toBeLessThan(
      emit.mock.invocationCallOrder[0],
    )
  })

  it('does nothing extra when no socket server is running', async () => {
    mockGetInstance.mockReturnValue(undefined)
    await expect(announcementsChanged()).resolves.toBeUndefined()
    expect(mockInvalidate).toHaveBeenCalledTimes(1)
  })

  it('never throws when the broadcast fails', async () => {
    mockGetInstance.mockReturnValue({
      io: {
        emit: () => {
          throw new Error('socket down')
        },
      },
    })
    await expect(announcementsChanged()).resolves.toBeUndefined()
  })
})
