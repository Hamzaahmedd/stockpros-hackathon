const mockPrisma: any = {
  announcement: { findMany: jest.fn() },
}
jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const mockGetCache = jest.fn()
const mockSetCache = jest.fn()
const mockDeleteCache = jest.fn()
jest.mock('../../../shared/infrastructure/cache', () => ({
  getCache: (...args: unknown[]) => mockGetCache(...args),
  setCache: (...args: unknown[]) => mockSetCache(...args),
  deleteCache: (...args: unknown[]) => mockDeleteCache(...args),
}))

import { AnnouncementStatus } from '@prisma/client'
import { CACHE_TTL } from '../../../shared/constants/cache-constants'
import {
  getActiveAnnouncements,
  invalidateActiveAnnouncements,
} from '../active-cache'
import { ANNOUNCEMENT_CACHE_KEYS } from '../constants'
import { makeAnnouncement, NOW_MS } from './fixtures'

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'a1',
  title: 'T',
  body: 'B',
  ctaLabel: null,
  ctaUrl: null,
  imageUrl: null,
  placement: 'MODAL',
  severity: null,
  anchor: null,
  navKey: null,
  priority: 2,
  dismissible: true,
  inChangelog: true,
  targetPlans: ['ALL'],
  targetRoles: [],
  startsAt: new Date(NOW_MS - 1000),
  endsAt: new Date(NOW_MS + 1000),
  publishedAt: new Date(NOW_MS - 5000),
  createdAt: new Date(NOW_MS - 9000),
  reannounceEpoch: 3,
  ...overrides,
})

beforeEach(async () => {
  jest.clearAllMocks()
  mockGetCache.mockResolvedValue(null)
  mockSetCache.mockResolvedValue(undefined)
  mockDeleteCache.mockResolvedValue(undefined)
  await invalidateActiveAnnouncements()
  jest.clearAllMocks()
  mockGetCache.mockResolvedValue(null)
})

describe('getActiveAnnouncements', () => {
  it('loads from PostgreSQL on a full miss and fills Redis', async () => {
    mockPrisma.announcement.findMany.mockResolvedValue([row()])

    const result = await getActiveAnnouncements(NOW_MS)

    expect(result).toEqual([
      expect.objectContaining({
        id: 'a1',
        startsAtMs: NOW_MS - 1000,
        endsAtMs: NOW_MS + 1000,
        publishedAtMs: NOW_MS - 5000,
        reannounceEpoch: 3,
      }),
    ])
    expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: AnnouncementStatus.PUBLISHED,
          isEnabled: true,
        }),
      }),
    )
    expect(mockSetCache).toHaveBeenCalledWith(
      ANNOUNCEMENT_CACHE_KEYS.ACTIVE_LIST,
      result,
      CACHE_TTL.ANNOUNCEMENTS.ACTIVE_LIST,
    )
  })

  it('falls back to createdAt and null bounds when optional dates are missing', async () => {
    mockPrisma.announcement.findMany.mockResolvedValue([
      row({ startsAt: null, endsAt: null, publishedAt: null }),
    ])
    const [item] = await getActiveAnnouncements(NOW_MS)
    expect(item.startsAtMs).toBeNull()
    expect(item.endsAtMs).toBeNull()
    expect(item.publishedAtMs).toBe(NOW_MS - 9000)
  })

  it('serves from Redis without touching PostgreSQL', async () => {
    const cached = [makeAnnouncement()]
    mockGetCache.mockResolvedValue(cached)

    expect(await getActiveAnnouncements(NOW_MS)).toBe(cached)
    expect(mockPrisma.announcement.findMany).not.toHaveBeenCalled()
    expect(mockSetCache).not.toHaveBeenCalled()
  })

  it('serves from L1 inside the TTL, then reloads after it', async () => {
    mockPrisma.announcement.findMany.mockResolvedValue([row()])
    await getActiveAnnouncements(NOW_MS)
    await getActiveAnnouncements(NOW_MS + CACHE_TTL.ANNOUNCEMENTS.L1_MS - 1)
    expect(mockGetCache).toHaveBeenCalledTimes(1)

    await getActiveAnnouncements(NOW_MS + CACHE_TTL.ANNOUNCEMENTS.L1_MS)
    expect(mockGetCache).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent misses into one database load', async () => {
    mockPrisma.announcement.findMany.mockResolvedValue([row()])

    await Promise.all(
      Array.from({ length: 25 }, () => getActiveAnnouncements(NOW_MS)),
    )

    expect(mockPrisma.announcement.findMany).toHaveBeenCalledTimes(1)
  })

  it('releases the single-flight slot after a failed load', async () => {
    mockPrisma.announcement.findMany.mockRejectedValueOnce(new Error('db down'))
    await expect(getActiveAnnouncements(NOW_MS)).rejects.toThrow('db down')

    mockPrisma.announcement.findMany.mockResolvedValue([row()])
    await expect(getActiveAnnouncements(NOW_MS)).resolves.toHaveLength(1)
  })
})

describe('invalidateActiveAnnouncements', () => {
  it('drops Redis and L1 so the next read reloads', async () => {
    mockPrisma.announcement.findMany.mockResolvedValue([row()])
    await getActiveAnnouncements(NOW_MS)

    await invalidateActiveAnnouncements()
    expect(mockDeleteCache).toHaveBeenCalledWith(
      ANNOUNCEMENT_CACHE_KEYS.ACTIVE_LIST,
    )

    await getActiveAnnouncements(NOW_MS)
    expect(mockPrisma.announcement.findMany).toHaveBeenCalledTimes(2)
  })

  it('does not throw when Redis deletion fails', async () => {
    mockDeleteCache.mockRejectedValueOnce(new Error('redis down'))
    await expect(invalidateActiveAnnouncements()).resolves.toBeUndefined()
  })

  it('does not let a load that began before an invalidation repopulate the caches', async () => {
    let release: (rows: unknown[]) => void = () => undefined
    mockPrisma.announcement.findMany.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const stale = getActiveAnnouncements(NOW_MS)
    await Promise.resolve()
    await Promise.resolve()

    await invalidateActiveAnnouncements()
    release([row({ id: 'stale' })])
    await stale

    expect(mockSetCache).not.toHaveBeenCalled()

    mockPrisma.announcement.findMany.mockResolvedValue([row({ id: 'fresh' })])
    const [item] = await getActiveAnnouncements(NOW_MS)
    expect(item.id).toBe('fresh')
  })
})
