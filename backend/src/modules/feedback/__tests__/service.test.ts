jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    feedback: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn() },
}))

const mockSendWebhook = jest.fn()
jest.mock('../webhook', () => ({
  sendFeedbackWebhook: (...args: unknown[]) => mockSendWebhook(...args),
}))

import { NotFoundError } from '../../../shared/errors'
import { logger } from '../../../shared/infrastructure/logger'
import { prisma } from '../../../shared/infrastructure/database'
import { listFeedback, submitFeedback, updateFeedbackStatus } from '../service'

const mockFeedback = prisma.feedback as unknown as {
  [method: string]: jest.Mock
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSendWebhook.mockResolvedValue(undefined)
  mockFeedback.groupBy.mockResolvedValue([])
})

describe('submitFeedback', () => {
  const stored = {
    id: 'f1',
    userId: 'user-1',
    message: 'great app',
    page: '/dashboard',
    category: 'GENERAL',
  }

  it('stores the message, page and category, with the plan the server saw', async () => {
    mockFeedback.create.mockResolvedValue(stored)

    const result = await submitFeedback({
      userId: 'user-1',
      planTier: 'PRO',
      message: 'great app',
      page: '/dashboard',
      category: 'GENERAL',
    })

    expect(mockFeedback.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        message: 'great app',
        page: '/dashboard',
        category: 'GENERAL',
        metadata: { planTier: 'PRO' },
      },
    })
    expect(result.id).toBe('f1')
  })

  it('merges what the browser reported, and the session plan always wins', async () => {
    mockFeedback.create.mockResolvedValue(stored)

    await submitFeedback({
      userId: 'user-1',
      planTier: 'FREE',
      message: 'm',
      clientMetadata: {
        userAgent: 'Mozilla/5.0',
        viewport: { width: 1440, height: 900 },
        appVersion: '1.0.0',
        // Defence in depth: validation already refuses this key.
        planTier: 'TEAM',
      } as never,
    })

    expect(mockFeedback.create.mock.calls[0][0].data.metadata).toEqual({
      userAgent: 'Mozilla/5.0',
      viewport: { width: 1440, height: 900 },
      appVersion: '1.0.0',
      planTier: 'FREE',
    })
  })

  it('defaults page and category to null when not provided', async () => {
    mockFeedback.create.mockResolvedValue({ id: 'f2' })
    await submitFeedback({
      userId: 'user-1',
      planTier: 'FREE',
      message: 'no page here',
    })
    expect(mockFeedback.create.mock.calls[0][0].data).toMatchObject({
      page: null,
      category: null,
    })
  })

  it('alerts the team after saving, with no identity, and does not wait for it', async () => {
    mockFeedback.create.mockResolvedValue(stored)
    let release: () => void = () => undefined
    mockSendWebhook.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )

    // Resolves even though the webhook has not finished.
    await expect(
      submitFeedback({ userId: 'user-1', planTier: 'PRO', message: 'm' }),
    ).resolves.toMatchObject({ id: 'f1' })

    expect(mockSendWebhook).toHaveBeenCalledWith({
      id: 'f1',
      category: 'GENERAL',
      message: 'great app',
      page: '/dashboard',
      planTier: 'PRO',
    })
    expect(mockSendWebhook.mock.calls[0][0]).not.toHaveProperty('userId')
    release()
  })

  it('does not alert, and fails, when the row cannot be saved', async () => {
    mockFeedback.create.mockRejectedValue(new Error('db down'))
    await expect(
      submitFeedback({ userId: 'user-1', planTier: 'FREE', message: 'm' }),
    ).rejects.toThrow('db down')
    expect(mockSendWebhook).not.toHaveBeenCalled()
  })
})

describe('listFeedback', () => {
  it('lists the first page with defaults when no query is given', async () => {
    mockFeedback.findMany.mockResolvedValue([{ id: 'f1' }, { id: 'f2' }])
    mockFeedback.count.mockResolvedValue(2)

    const result = await listFeedback()

    expect(mockFeedback.findUnique).not.toHaveBeenCalled()
    expect(mockFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, take: 21 }),
    )
    expect(result).toEqual({
      data: [{ id: 'f1' }, { id: 'f2' }],
      nextCursor: null,
      hasMore: false,
      total: 2,
      counts: { NEW: 0, READ: 0, ARCHIVED: 0 },
    })
  })

  it('selects the triage fields', async () => {
    mockFeedback.findMany.mockResolvedValue([])
    mockFeedback.count.mockResolvedValue(0)
    await listFeedback()
    expect(mockFeedback.findMany.mock.calls[0][0].select).toMatchObject({
      category: true,
      status: true,
      metadata: true,
      statusUpdatedAt: true,
    })
  })

  it('sets hasMore and nextCursor when there are more rows than the limit', async () => {
    mockFeedback.findMany.mockResolvedValue([
      { id: 'f1' },
      { id: 'f2' },
      { id: 'f3' },
    ])
    mockFeedback.count.mockResolvedValue(10)

    const result = await listFeedback({ limit: 2 })

    expect(result.hasMore).toBe(true)
    expect(result.data).toEqual([{ id: 'f1' }, { id: 'f2' }])
    expect(result.nextCursor).toBe('f2')
  })

  it('filters the page and the total by status, but counts every status', async () => {
    mockFeedback.findMany.mockResolvedValue([])
    mockFeedback.count.mockResolvedValue(3)
    mockFeedback.groupBy.mockResolvedValue([
      { status: 'NEW', _count: { _all: 3 } },
      { status: 'ARCHIVED', _count: { _all: 7 } },
    ])

    const result = await listFeedback({ status: 'NEW' })

    expect(mockFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'NEW' } }),
    )
    expect(mockFeedback.count).toHaveBeenCalledWith({
      where: { status: 'NEW' },
    })
    // The groupBy has no filter, so the tabs always show the whole inbox.
    expect(mockFeedback.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      _count: { _all: true },
    })
    expect(result.total).toBe(3)
    expect(result.counts).toEqual({ NEW: 3, READ: 0, ARCHIVED: 7 })
  })

  it('resolves a cursor to its createdAt and applies the keyset filter together with the status', async () => {
    const cursorCreatedAt = new Date('2024-01-01')
    mockFeedback.findUnique.mockResolvedValue({ createdAt: cursorCreatedAt })
    mockFeedback.findMany.mockResolvedValue([])
    mockFeedback.count.mockResolvedValue(0)

    await listFeedback({ cursor: 'f1', status: 'READ' })

    expect(mockFeedback.findUnique).toHaveBeenCalledWith({
      where: { id: 'f1' },
      select: { createdAt: true },
    })
    expect(mockFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'READ',
          OR: [
            { createdAt: { lt: cursorCreatedAt } },
            { createdAt: cursorCreatedAt, id: { lt: 'f1' } },
          ],
        },
      }),
    )
  })

  it('ignores an invalid/expired cursor and lists from the start', async () => {
    mockFeedback.findUnique.mockResolvedValue(null)
    mockFeedback.findMany.mockResolvedValue([])
    mockFeedback.count.mockResolvedValue(0)

    await listFeedback({ cursor: 'missing' })

    expect(mockFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    )
  })
})

describe('updateFeedbackStatus', () => {
  const at = new Date('2026-10-07T12:00:00.000Z')

  it('records who changed it and when, and logs ids only', async () => {
    mockFeedback.findUnique.mockResolvedValue({
      id: 'f1',
      status: 'NEW',
      statusUpdatedAt: null,
    })
    mockFeedback.update.mockResolvedValue({
      id: 'f1',
      status: 'READ',
      statusUpdatedAt: at,
    })

    const result = await updateFeedbackStatus('admin-1', 'f1', 'READ')

    expect(mockFeedback.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: {
        status: 'READ',
        statusUpdatedAt: expect.any(Date),
        statusUpdatedBy: 'admin-1',
      },
      select: { id: true, status: true, statusUpdatedAt: true },
    })
    expect(result).toEqual({
      id: 'f1',
      status: 'READ',
      statusUpdatedAt: at,
      changed: true,
    })
    const logged = (logger.info as jest.Mock).mock.calls.at(-1)[0] as string
    expect(logged).toContain('feedbackId=f1')
    expect(logged).toContain('by=admin-1')
    expect(logged).toContain('from=NEW')
    expect(logged).toContain('to=READ')
  })

  it('allows any move, including restoring an archived entry', async () => {
    mockFeedback.findUnique.mockResolvedValue({
      id: 'f1',
      status: 'ARCHIVED',
      statusUpdatedAt: at,
    })
    mockFeedback.update.mockResolvedValue({
      id: 'f1',
      status: 'NEW',
      statusUpdatedAt: at,
    })
    expect((await updateFeedbackStatus('admin-1', 'f1', 'NEW')).changed).toBe(
      true,
    )
  })

  it('is a no-op when it already has that status', async () => {
    mockFeedback.findUnique.mockResolvedValue({
      id: 'f1',
      status: 'READ',
      statusUpdatedAt: at,
    })

    const result = await updateFeedbackStatus('admin-1', 'f1', 'READ')

    expect(result).toEqual({
      id: 'f1',
      status: 'READ',
      statusUpdatedAt: at,
      changed: false,
    })
    expect(mockFeedback.update).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('404s for an unknown entry', async () => {
    mockFeedback.findUnique.mockResolvedValue(null)
    await expect(
      updateFeedbackStatus('admin-1', 'nope', 'READ'),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(mockFeedback.update).not.toHaveBeenCalled()
  })
})
