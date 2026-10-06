const mockPrisma: any = {
  announcementUserState: { findMany: jest.fn() },
}
jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const mockPipeline = {
  del: jest.fn().mockReturnThis(),
  hset: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn(),
}
const mockRedis = {
  hgetall: jest.fn(),
  multi: jest.fn(() => mockPipeline),
}
let mockClient: typeof mockRedis | null = mockRedis
jest.mock('../../../shared/infrastructure/cache', () => ({
  getRawRedisClient: () => mockClient,
  resolveTtl: (seconds: number) => seconds,
}))

import config from '@/config'
import {
  ANNOUNCEMENT_CACHE_KEYS,
  USER_STATE_SENTINEL_FIELD,
} from '../constants'
import { cacheUserStates, loadUserStates } from '../state-store'
import { ANNOUNCEMENT_ID, OTHER_USER_ID, USER_ID } from './fixtures'

const dbRow = {
  announcementId: ANNOUNCEMENT_ID,
  epoch: 2,
  seenAt: new Date(),
  dismissedAt: new Date(),
}

beforeEach(() => {
  jest.clearAllMocks()
  mockClient = mockRedis
  config.cache.enabled = true
  mockRedis.hgetall.mockResolvedValue({})
  mockPipeline.exec.mockResolvedValue([])
  mockPrisma.announcementUserState.findMany.mockResolvedValue([])
})

describe('loadUserStates', () => {
  it('serves a hydrated Redis hash without touching PostgreSQL', async () => {
    mockRedis.hgetall.mockResolvedValue({
      [USER_STATE_SENTINEL_FIELD]: '1',
      [ANNOUNCEMENT_ID]: '2|1|1',
      broken: 'not-a-state',
    })

    const states = await loadUserStates(USER_ID)

    expect(states.get(ANNOUNCEMENT_ID)).toEqual({
      epoch: 2,
      seen: true,
      dismissed: true,
    })
    expect(states.has('broken')).toBe(false)
    expect(mockRedis.hgetall).toHaveBeenCalledWith(
      ANNOUNCEMENT_CACHE_KEYS.userState(USER_ID),
    )
    expect(mockPrisma.announcementUserState.findMany).not.toHaveBeenCalled()
  })

  it('treats a hydrated-but-empty hash as a real empty state', async () => {
    mockRedis.hgetall.mockResolvedValue({ [USER_STATE_SENTINEL_FIELD]: '1' })
    expect((await loadUserStates(USER_ID)).size).toBe(0)
    expect(mockPrisma.announcementUserState.findMany).not.toHaveBeenCalled()
  })

  it('hydrates from PostgreSQL on a cold cache, scoped to the user, and writes back', async () => {
    mockPrisma.announcementUserState.findMany.mockResolvedValue([
      dbRow,
      { ...dbRow, announcementId: 'x', seenAt: null, dismissedAt: null },
    ])

    const states = await loadUserStates(USER_ID)

    expect(mockPrisma.announcementUserState.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } }),
    )
    expect(states.get(ANNOUNCEMENT_ID)).toEqual({
      epoch: 2,
      seen: true,
      dismissed: true,
    })
    expect(states.get('x')).toEqual({ epoch: 2, seen: false, dismissed: false })
    expect(mockPipeline.del).toHaveBeenCalled()
    expect(mockPipeline.hset).toHaveBeenCalledWith(
      ANNOUNCEMENT_CACHE_KEYS.userState(USER_ID),
      ANNOUNCEMENT_ID,
      '2|1|1',
    )
  })

  it("never reads another user's hash", async () => {
    await loadUserStates(OTHER_USER_ID)
    expect(mockRedis.hgetall).toHaveBeenCalledWith(
      ANNOUNCEMENT_CACHE_KEYS.userState(OTHER_USER_ID),
    )
  })

  it('falls back to PostgreSQL when Redis reads fail', async () => {
    mockRedis.hgetall.mockRejectedValue(new Error('redis down'))
    mockPrisma.announcementUserState.findMany.mockResolvedValue([dbRow])

    expect(
      (await loadUserStates(USER_ID)).get(ANNOUNCEMENT_ID)?.dismissed,
    ).toBe(true)
  })

  it('survives a failing Redis write-back', async () => {
    mockPipeline.exec.mockRejectedValue(new Error('redis down'))
    await expect(loadUserStates(USER_ID)).resolves.toBeInstanceOf(Map)
  })

  it('uses PostgreSQL only when there is no Redis client or caching is off', async () => {
    mockClient = null
    await loadUserStates(USER_ID)
    expect(mockPrisma.announcementUserState.findMany).toHaveBeenCalledTimes(1)

    mockClient = mockRedis
    config.cache.enabled = false
    await loadUserStates(USER_ID)
    expect(mockRedis.hgetall).not.toHaveBeenCalled()
    expect(mockPrisma.announcementUserState.findMany).toHaveBeenCalledTimes(2)
  })
})

describe('cacheUserStates', () => {
  it('merges states into the hash without deleting it', async () => {
    await cacheUserStates(
      USER_ID,
      new Map([[ANNOUNCEMENT_ID, { epoch: 1, seen: true, dismissed: false }]]),
    )
    expect(mockPipeline.del).not.toHaveBeenCalled()
    expect(mockPipeline.hset).toHaveBeenCalledWith(
      ANNOUNCEMENT_CACHE_KEYS.userState(USER_ID),
      ANNOUNCEMENT_ID,
      '1|1|0',
    )
    expect(mockPipeline.expire).toHaveBeenCalled()
  })
})
