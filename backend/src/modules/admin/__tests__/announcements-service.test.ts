/**
 * Staff announcement lifecycle: every write commits together with its audit row,
 * stale edits are refused, the caches are refreshed only after a real change,
 * and a cache failure never fails the request.
 */
const mockTx: any = {
  announcement: {
    findUnique: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  adminAuditLog: { create: jest.fn() },
}
const mockPrisma: any = {
  announcement: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
  },
  announcementUserState: { count: jest.fn() },
  $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(mockTx)),
}
jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

jest.mock('../../auth', () => ({ authTokenMiddleware: jest.fn() }))

const mockChanged = jest.fn()
jest.mock('../../announcements/public', () => ({
  announcementsChanged: (...args: unknown[]) => mockChanged(...args),
}))

import { AdminAuditAction, AnnouncementStatus } from '@prisma/client'
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors'
import {
  archiveAnnouncement,
  createAnnouncement,
  getAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  reannounceAnnouncement,
  setAnnouncementEnabled,
  toAdminDto,
  updateAnnouncement,
} from '../announcements-service'

const ADMIN = '0191e4a0-0000-7000-8000-0000000000aa'
const ID = '0191e4a0-0000-7000-8000-0000000000cc'
const ctx = {
  adminId: ADMIN,
  reason: 'Launching the forecast panel',
  ipAddress: '1.2.3.4',
}
const DATE = new Date('2026-10-07T12:00:00.000Z')

const row = (overrides: Record<string, unknown> = {}): any => ({
  id: ID,
  title: 'Title',
  body: 'Body',
  ctaLabel: null,
  ctaUrl: null,
  imageUrl: null,
  placement: 'MODAL',
  severity: null,
  anchor: null,
  navKey: null,
  priority: 0,
  dismissible: true,
  inChangelog: true,
  targetPlans: ['ALL'],
  targetRoles: [],
  startsAt: null,
  endsAt: null,
  publishedAt: null,
  status: AnnouncementStatus.DRAFT,
  isEnabled: true,
  version: 1,
  reannounceEpoch: 1,
  createdBy: ADMIN,
  updatedBy: ADMIN,
  createdAt: DATE,
  updatedAt: DATE,
  ...overrides,
})

const createInput = (overrides: Record<string, unknown> = {}): any => ({
  title: 'Meet the new forecast panel',
  body: 'Faster, clearer signals.',
  placement: 'MODAL',
  priority: 0,
  dismissible: true,
  inChangelog: true,
  targetPlans: ['ALL'],
  targetRoles: [],
  reason: ctx.reason,
  ...overrides,
})

const auditAction = () => mockTx.adminAuditLog.create.mock.calls[0]?.[0]?.data

beforeEach(() => {
  jest.clearAllMocks()
  mockChanged.mockResolvedValue(undefined)
  // reset (not just clear) so unconsumed once-values never leak into the next test
  mockTx.announcement.findUnique.mockReset().mockResolvedValue(row())
  mockTx.announcement.updateMany.mockReset().mockResolvedValue({ count: 1 })
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(mockTx),
  )
})

describe('toAdminDto', () => {
  it('serialises dates as ISO strings', () => {
    const dto = toAdminDto(
      row({ startsAt: DATE, publishedAt: DATE, status: 'PUBLISHED' }),
    )
    expect(dto.startsAt).toBe('2026-10-07T12:00:00.000Z')
    expect(dto.endsAt).toBeNull()
    expect(dto.createdAt).toBe('2026-10-07T12:00:00.000Z')
  })
})

describe('listAnnouncements', () => {
  it('filters, pages and reports the total', async () => {
    mockPrisma.announcement.findMany.mockResolvedValue([row()])
    mockPrisma.announcement.count.mockResolvedValue(41)

    const result = await listAnnouncements({
      page: 3,
      limit: 10,
      status: AnnouncementStatus.PUBLISHED,
      placement: 'BANNER',
    })

    expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PUBLISHED', placement: 'BANNER' },
        skip: 20,
        take: 10,
      }),
    )
    expect(result).toMatchObject({ total: 41, page: 3, limit: 10 })
    expect(result.items).toHaveLength(1)
  })

  it('applies no filter by default', async () => {
    mockPrisma.announcement.findMany.mockResolvedValue([])
    mockPrisma.announcement.count.mockResolvedValue(0)
    await listAnnouncements({ page: 1, limit: 25 })
    expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    )
  })
})

describe('getAnnouncement', () => {
  it('returns the announcement with engagement for the current epoch', async () => {
    mockPrisma.announcement.findUnique.mockResolvedValue(
      row({ reannounceEpoch: 2 }),
    )
    mockPrisma.announcementUserState.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(4)

    const result = await getAnnouncement(ID)

    expect(result.engagement).toEqual({ seen: 10, dismissed: 4 })
    expect(mockPrisma.announcementUserState.count).toHaveBeenCalledWith({
      where: { announcementId: ID, epoch: 2, seenAt: { not: null } },
    })
  })

  it('404s for an unknown announcement', async () => {
    mockPrisma.announcement.findUnique.mockResolvedValue(null)
    await expect(getAnnouncement(ID)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('createAnnouncement', () => {
  it('stores a DRAFT and audits it in the same transaction, without touching the caches', async () => {
    mockTx.announcement.create.mockResolvedValue(row())

    const dto = await createAnnouncement(ctx, createInput())

    expect(mockTx.announcement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: AnnouncementStatus.DRAFT,
        createdBy: ADMIN,
        updatedBy: ADMIN,
        title: 'Meet the new forecast panel',
      }),
    })
    expect(auditAction()).toMatchObject({
      action: AdminAuditAction.ANNOUNCEMENT_CREATED,
      targetType: 'ANNOUNCEMENT',
      targetId: ID,
      adminId: ADMIN,
    })
    expect(mockChanged).not.toHaveBeenCalled()
    expect(dto.status).toBe('DRAFT')
  })

  it('rejects content that breaks a cross-field rule before writing anything', async () => {
    await expect(
      createAnnouncement(ctx, createInput({ placement: 'SPOTLIGHT' })),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('converts schedule strings to dates', async () => {
    mockTx.announcement.create.mockResolvedValue(row())
    await createAnnouncement(
      ctx,
      createInput({
        startsAt: '2026-10-08T00:00:00Z',
        endsAt: '2026-10-09T00:00:00Z',
      }),
    )
    expect(mockTx.announcement.create.mock.calls[0][0].data).toMatchObject({
      startsAt: new Date('2026-10-08T00:00:00Z'),
      endsAt: new Date('2026-10-09T00:00:00Z'),
    })
  })
})

describe('updateAnnouncement', () => {
  const input = (overrides: Record<string, unknown> = {}): any => ({
    expectedVersion: 1,
    reason: ctx.reason,
    ...overrides,
  })

  beforeEach(() => {
    mockTx.announcement.findUnique
      .mockResolvedValueOnce(row({ status: 'PUBLISHED' }))
      .mockResolvedValueOnce(
        row({ status: 'PUBLISHED', title: 'New', version: 2 }),
      )
  })

  it('applies only the fields given, audits the changed field names, then refreshes the caches', async () => {
    const dto = await updateAnnouncement(ctx, ID, input({ title: 'New' }))

    expect(mockTx.announcement.updateMany).toHaveBeenCalledWith({
      where: { id: ID, version: 1 },
      data: expect.objectContaining({
        title: 'New',
        body: 'Body',
        updatedBy: ADMIN,
        version: { increment: 1 },
      }),
    })
    expect(auditAction()).toMatchObject({
      action: AdminAuditAction.ANNOUNCEMENT_UPDATED,
      metadata: { changedFields: ['title'], version: 2 },
    })
    expect(mockChanged).toHaveBeenCalledTimes(1)
    expect(dto.title).toBe('New')
  })

  it('can clear an optional field', async () => {
    mockTx.announcement.findUnique.mockReset()
    mockTx.announcement.findUnique
      .mockResolvedValueOnce(
        row({ ctaLabel: 'Go', ctaUrl: '/plans', version: 1 }),
      )
      .mockResolvedValueOnce(row({ version: 2 }))
    await updateAnnouncement(ctx, ID, input({ ctaLabel: null, ctaUrl: null }))
    expect(auditAction().metadata.changedFields).toEqual(['ctaLabel', 'ctaUrl'])
  })

  it('refuses a stale edit', async () => {
    await expect(
      updateAnnouncement(ctx, ID, input({ title: 'New', expectedVersion: 7 })),
    ).rejects.toBeInstanceOf(ConflictError)
    expect(mockTx.announcement.updateMany).not.toHaveBeenCalled()
    expect(mockChanged).not.toHaveBeenCalled()
  })

  it('refuses an edit that loses a concurrent race', async () => {
    mockTx.announcement.updateMany.mockResolvedValue({ count: 0 })
    await expect(
      updateAnnouncement(ctx, ID, input({ title: 'New' })),
    ).rejects.toBeInstanceOf(ConflictError)
    expect(mockTx.adminAuditLog.create).not.toHaveBeenCalled()
  })

  it('refuses a no-op edit', async () => {
    await expect(
      updateAnnouncement(ctx, ID, input({ title: 'Title' })),
    ).rejects.toThrow('Nothing to change')
  })

  it('validates the merged result, not just the patch', async () => {
    await expect(
      updateAnnouncement(ctx, ID, input({ placement: 'BADGE' })),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses to edit an archived announcement and 404s an unknown one', async () => {
    mockTx.announcement.findUnique.mockReset()
    mockTx.announcement.findUnique.mockResolvedValueOnce(
      row({ status: 'ARCHIVED' }),
    )
    await expect(
      updateAnnouncement(ctx, ID, input({ title: 'New' })),
    ).rejects.toBeInstanceOf(ConflictError)

    mockTx.announcement.findUnique.mockResolvedValueOnce(null)
    await expect(
      updateAnnouncement(ctx, ID, input({ title: 'New' })),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('does not fail the request when the cache refresh fails', async () => {
    mockChanged.mockRejectedValue(new Error('redis down'))
    await expect(
      updateAnnouncement(ctx, ID, input({ title: 'New' })),
    ).resolves.toMatchObject({ title: 'New' })
  })
})

describe('publishAnnouncement', () => {
  it('publishes a draft, stamps publishedAt, audits and refreshes the caches', async () => {
    mockTx.announcement.findUnique
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ status: 'PUBLISHED', version: 2 }))

    const dto = await publishAnnouncement(ctx, ID)

    const data = mockTx.announcement.updateMany.mock.calls[0][0].data
    expect(data.status).toBe(AnnouncementStatus.PUBLISHED)
    expect(data.publishedAt).toBeInstanceOf(Date)
    expect(auditAction().action).toBe(AdminAuditAction.ANNOUNCEMENT_PUBLISHED)
    expect(mockChanged).toHaveBeenCalledTimes(1)
    expect(dto.status).toBe('PUBLISHED')
  })

  it.each(['PUBLISHED', 'ARCHIVED'])(
    'refuses a %s announcement',
    async (status) => {
      mockTx.announcement.findUnique.mockResolvedValueOnce(row({ status }))
      await expect(publishAnnouncement(ctx, ID)).rejects.toBeInstanceOf(
        ConflictError,
      )
      expect(mockChanged).not.toHaveBeenCalled()
    },
  )

  it('refuses a draft whose window has already ended', async () => {
    mockTx.announcement.findUnique.mockResolvedValueOnce(
      row({ endsAt: new Date(Date.now() - 1000) }),
    )
    await expect(publishAnnouncement(ctx, ID)).rejects.toThrow(
      'endsAt is already in the past',
    )
  })
})

describe('setAnnouncementEnabled', () => {
  it('switches an announcement off, audits the change and refreshes the caches', async () => {
    mockTx.announcement.findUnique
      .mockResolvedValueOnce(row({ status: 'PUBLISHED', isEnabled: true }))
      .mockResolvedValueOnce(
        row({ status: 'PUBLISHED', isEnabled: false, version: 2 }),
      )

    const result = await setAnnouncementEnabled(ctx, ID, false)

    expect(mockTx.announcement.updateMany.mock.calls[0][0].data).toMatchObject({
      isEnabled: false,
    })
    expect(auditAction()).toMatchObject({
      action: AdminAuditAction.ANNOUNCEMENT_KILL_SWITCH_TOGGLED,
      metadata: { isEnabled: false, previousIsEnabled: true },
    })
    expect(mockChanged).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ isEnabled: false, changed: true })
  })

  it('is a silent no-op when already in the requested state', async () => {
    mockTx.announcement.findUnique.mockResolvedValueOnce(
      row({ status: 'PUBLISHED', isEnabled: false }),
    )

    const result = await setAnnouncementEnabled(ctx, ID, false)

    expect(result.changed).toBe(false)
    expect(mockTx.announcement.updateMany).not.toHaveBeenCalled()
    expect(mockTx.adminAuditLog.create).not.toHaveBeenCalled()
    expect(mockChanged).not.toHaveBeenCalled()
  })

  it('refuses an archived announcement', async () => {
    mockTx.announcement.findUnique.mockResolvedValueOnce(
      row({ status: 'ARCHIVED' }),
    )
    await expect(setAnnouncementEnabled(ctx, ID, true)).rejects.toBeInstanceOf(
      ConflictError,
    )
  })
})

describe('reannounceAnnouncement', () => {
  it('starts a new epoch so earlier dismissals stop counting', async () => {
    mockTx.announcement.findUnique
      .mockResolvedValueOnce(row({ status: 'PUBLISHED', reannounceEpoch: 2 }))
      .mockResolvedValueOnce(
        row({ status: 'PUBLISHED', reannounceEpoch: 3, version: 2 }),
      )

    const dto = await reannounceAnnouncement(ctx, ID)

    expect(mockTx.announcement.updateMany.mock.calls[0][0].data).toMatchObject({
      reannounceEpoch: 3,
    })
    expect(auditAction()).toMatchObject({
      action: AdminAuditAction.ANNOUNCEMENT_REANNOUNCED,
      metadata: { previousEpoch: 2, reannounceEpoch: 3 },
    })
    expect(mockChanged).toHaveBeenCalledTimes(1)
    expect(dto.reannounceEpoch).toBe(3)
  })

  it('only applies to a published announcement', async () => {
    await expect(reannounceAnnouncement(ctx, ID)).rejects.toBeInstanceOf(
      ConflictError,
    )
  })
})

describe('archiveAnnouncement', () => {
  it('soft-deletes, audits the previous status and refreshes the caches', async () => {
    mockTx.announcement.findUnique
      .mockResolvedValueOnce(row({ status: 'PUBLISHED' }))
      .mockResolvedValueOnce(row({ status: 'ARCHIVED', version: 2 }))

    const dto = await archiveAnnouncement(ctx, ID)

    expect(auditAction()).toMatchObject({
      action: AdminAuditAction.ANNOUNCEMENT_ARCHIVED,
      metadata: { previousStatus: 'PUBLISHED' },
    })
    expect(mockChanged).toHaveBeenCalledTimes(1)
    expect(dto.status).toBe('ARCHIVED')
  })

  it('refuses to archive twice', async () => {
    mockTx.announcement.findUnique.mockResolvedValueOnce(
      row({ status: 'ARCHIVED' }),
    )
    await expect(archiveAnnouncement(ctx, ID)).rejects.toBeInstanceOf(
      ConflictError,
    )
  })
})
