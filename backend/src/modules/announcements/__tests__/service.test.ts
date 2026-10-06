const mockPrisma: any = {
  user: { findUnique: jest.fn() },
  announcement: { findUnique: jest.fn() },
  announcementUserState: { upsert: jest.fn((args: unknown) => args) },
  $transaction: jest.fn(),
}
jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const mockGetActive = jest.fn()
jest.mock('../active-cache', () => ({
  getActiveAnnouncements: (...args: unknown[]) => mockGetActive(...args),
}))

const mockLoadStates = jest.fn()
const mockCacheStates = jest.fn()
jest.mock('../state-store', () => ({
  loadUserStates: (...args: unknown[]) => mockLoadStates(...args),
  cacheUserStates: (...args: unknown[]) => mockCacheStates(...args),
}))

import config from '@/config'
import { AnnouncementStatus, TeamRole } from '@prisma/client'
import { ConflictError, NotFoundError } from '../../../shared/errors'
import {
  getBootAnnouncements,
  getBootPayload,
  listChangelog,
  markAllSeen,
  nextUserState,
  recordAction,
  resolveAudience,
  StateAction,
  toAudience,
} from '../service'
import {
  ANNOUNCEMENT_ID,
  makeAnnouncement,
  NOW_MS,
  OWNER_FREE,
  USER_ID,
} from './fixtures'

const published = (overrides: Record<string, unknown> = {}) => ({
  id: ANNOUNCEMENT_ID,
  status: AnnouncementStatus.PUBLISHED,
  isEnabled: true,
  dismissible: true,
  reannounceEpoch: 1,
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockLoadStates.mockResolvedValue(new Map())
  mockCacheStates.mockResolvedValue(undefined)
  mockGetActive.mockResolvedValue([])
  mockPrisma.announcement.findUnique.mockResolvedValue(published())
  mockPrisma.$transaction.mockResolvedValue([])
})

describe('nextUserState', () => {
  it('starts fresh when nothing is recorded', () => {
    expect(nextUserState(undefined, 1, StateAction.SEEN)).toEqual({
      epoch: 1,
      seen: true,
      dismissed: false,
    })
  })

  it('dismissing also marks the item read and keeps a dismissal once made', () => {
    const dismissed = nextUserState(undefined, 1, StateAction.DISMISSED)
    expect(dismissed).toEqual({ epoch: 1, seen: true, dismissed: true })
    expect(nextUserState(dismissed, 1, StateAction.SEEN).dismissed).toBe(true)
  })

  it('discards state recorded under an older epoch', () => {
    const old = { epoch: 1, seen: true, dismissed: true }
    expect(nextUserState(old, 2, StateAction.SEEN)).toEqual({
      epoch: 2,
      seen: true,
      dismissed: false,
    })
  })
})

describe('getBootPayload', () => {
  it('evaluates the cached list against the stored state', async () => {
    const item = makeAnnouncement()
    mockGetActive.mockResolvedValue([item])

    const payload = await getBootPayload(USER_ID, OWNER_FREE, NOW_MS)

    expect(mockLoadStates).toHaveBeenCalledWith(USER_ID)
    expect(payload.modal?.id).toBe(item.id)
  })
})

describe('listChangelog', () => {
  it('pages the visible changelog and reports totals', async () => {
    const items = [1, 2, 3].map((n) =>
      makeAnnouncement({ publishedAtMs: NOW_MS - n }),
    )
    mockGetActive.mockResolvedValue(items)

    const page = await listChangelog(
      USER_ID,
      OWNER_FREE,
      { limit: 2, offset: 1 },
      NOW_MS,
    )

    expect(page.items.map((item) => item.id)).toEqual([
      items[1].id,
      items[2].id,
    ])
    expect(page.total).toBe(3)
    expect(page.unreadCount).toBe(3)
  })

  it('defaults to the first page', async () => {
    mockGetActive.mockResolvedValue([makeAnnouncement()])
    const page = await listChangelog(USER_ID, OWNER_FREE, undefined, NOW_MS)
    expect(page.items).toHaveLength(1)
  })
})

describe('recordAction', () => {
  it('persists a dismissal for the caller, then mirrors it to Redis', async () => {
    const now = new Date(NOW_MS)
    await recordAction(USER_ID, ANNOUNCEMENT_ID, StateAction.DISMISSED, now)

    expect(mockPrisma.announcementUserState.upsert).toHaveBeenCalledWith({
      where: {
        userId_announcementId: {
          userId: USER_ID,
          announcementId: ANNOUNCEMENT_ID,
        },
      },
      create: {
        userId: USER_ID,
        announcementId: ANNOUNCEMENT_ID,
        epoch: 1,
        seenAt: now,
        dismissedAt: now,
      },
      update: { epoch: 1, seenAt: now, dismissedAt: now },
    })
    expect(mockCacheStates).toHaveBeenCalledWith(
      USER_ID,
      new Map([[ANNOUNCEMENT_ID, { epoch: 1, seen: true, dismissed: true }]]),
    )
  })

  it('records the current epoch so a reset announcement can be dismissed again', async () => {
    mockPrisma.announcement.findUnique.mockResolvedValue(
      published({ reannounceEpoch: 4 }),
    )
    mockLoadStates.mockResolvedValue(
      new Map([[ANNOUNCEMENT_ID, { epoch: 3, seen: true, dismissed: true }]]),
    )

    await recordAction(USER_ID, ANNOUNCEMENT_ID, StateAction.SEEN)

    const call = mockPrisma.announcementUserState.upsert.mock.calls[0][0]
    expect(call.update).toMatchObject({ epoch: 4, dismissedAt: null })
  })

  it.each([
    ['missing', null],
    ['a draft', published({ status: AnnouncementStatus.DRAFT })],
    ['archived', published({ status: AnnouncementStatus.ARCHIVED })],
    ['switched off', published({ isEnabled: false })],
  ])('rejects an announcement that is %s', async (_label, record) => {
    mockPrisma.announcement.findUnique.mockResolvedValue(record)
    await expect(
      recordAction(USER_ID, ANNOUNCEMENT_ID, StateAction.DISMISSED),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(mockPrisma.announcementUserState.upsert).not.toHaveBeenCalled()
  })

  it('refuses to dismiss a non-dismissible announcement but allows marking it seen', async () => {
    mockPrisma.announcement.findUnique.mockResolvedValue(
      published({ dismissible: false }),
    )
    await expect(
      recordAction(USER_ID, ANNOUNCEMENT_ID, StateAction.DISMISSED),
    ).rejects.toBeInstanceOf(ConflictError)

    await expect(
      recordAction(USER_ID, ANNOUNCEMENT_ID, StateAction.SEEN),
    ).resolves.toBeUndefined()
  })
})

describe('markAllSeen', () => {
  it('marks only unread, visible changelog entries and mirrors them', async () => {
    const unread = makeAnnouncement()
    const alreadyRead = makeAnnouncement()
    const notInChangelog = makeAnnouncement({ inChangelog: false })
    const wrongRole = makeAnnouncement({ targetRoles: [TeamRole.ADMIN] })
    mockGetActive.mockResolvedValue([
      unread,
      alreadyRead,
      notInChangelog,
      wrongRole,
    ])
    mockLoadStates.mockResolvedValue(
      new Map([[alreadyRead.id, { epoch: 1, seen: true, dismissed: false }]]),
    )

    const count = await markAllSeen(USER_ID, OWNER_FREE, new Date(NOW_MS))

    expect(count).toBe(1)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.announcementUserState.upsert).toHaveBeenCalledTimes(1)
    expect(mockCacheStates).toHaveBeenCalledWith(
      USER_ID,
      new Map([[unread.id, { epoch: 1, seen: true, dismissed: false }]]),
    )
  })

  it('re-marks an entry whose recorded state is from an older epoch', async () => {
    const reset = makeAnnouncement({ reannounceEpoch: 2 })
    mockGetActive.mockResolvedValue([reset])
    mockLoadStates.mockResolvedValue(
      new Map([[reset.id, { epoch: 1, seen: true, dismissed: true }]]),
    )
    expect(await markAllSeen(USER_ID, OWNER_FREE, new Date(NOW_MS))).toBe(1)
  })

  it('does nothing when everything is already read', async () => {
    expect(await markAllSeen(USER_ID, OWNER_FREE, new Date(NOW_MS))).toBe(0)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockCacheStates).not.toHaveBeenCalled()
  })
})

describe('toAudience', () => {
  it('maps solo accounts to OWNER and keeps a workspace role', () => {
    expect(toAudience('FREE', null)).toEqual({
      plan: 'FREE',
      role: TeamRole.OWNER,
    })
    expect(toAudience('TEAM', TeamRole.MEMBER)).toEqual({
      plan: 'TEAM',
      role: TeamRole.MEMBER,
    })
  })
})

describe('resolveAudience', () => {
  it('reads the plan and the role from an ACTIVE workspace only', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      plan: 'TEAM',
      teamMembers: [{ role: TeamRole.ADMIN }],
    })

    expect(await resolveAudience(USER_ID)).toEqual({
      plan: 'TEAM',
      role: TeamRole.ADMIN,
    })
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        select: expect.objectContaining({
          teamMembers: expect.objectContaining({
            where: { team: { status: 'ACTIVE' } },
          }),
        }),
      }),
    )
  })

  it('treats a user without a workspace as OWNER and rejects an unknown user', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      plan: 'FREE',
      teamMembers: [],
    })
    expect((await resolveAudience(USER_ID)).role).toBe(TeamRole.OWNER)

    mockPrisma.user.findUnique.mockResolvedValueOnce(null)
    await expect(resolveAudience(USER_ID)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('getBootAnnouncements', () => {
  afterEach(() => {
    Object.assign(config.features, { enableAnnouncements: true })
  })

  it('returns null without touching the caches while the feature is off', async () => {
    Object.assign(config.features, { enableAnnouncements: false })
    expect(await getBootAnnouncements(USER_ID, 'FREE', null)).toBeNull()
    expect(mockGetActive).not.toHaveBeenCalled()
  })

  it('returns the evaluated payload', async () => {
    mockGetActive.mockResolvedValue([makeAnnouncement()])
    const payload = await getBootAnnouncements(USER_ID, 'FREE', null)
    expect(payload?.modal).not.toBeNull()
  })

  it('degrades to null instead of failing the app boot', async () => {
    mockGetActive.mockRejectedValue(new Error('db down'))
    expect(await getBootAnnouncements(USER_ID, 'FREE', null)).toBeNull()
  })
})
