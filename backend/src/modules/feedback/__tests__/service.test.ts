jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    feedback: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}))

jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: { info: jest.fn() },
}))

import { prisma } from '../../../shared/infrastructure/database'
import { listFeedback, submitFeedback } from '../service'

const mockFeedback = prisma.feedback as unknown as {
  [method: string]: jest.Mock
}

beforeEach(() => jest.clearAllMocks())

describe('submitFeedback', () => {
  it('creates a feedback entry with the given page', async () => {
    mockFeedback.create.mockResolvedValue({
      id: 'f1',
      userId: 'user-1',
      message: 'great app',
      page: '/dashboard',
    })

    const result = await submitFeedback('user-1', 'great app', '/dashboard')

    expect(mockFeedback.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', message: 'great app', page: '/dashboard' },
    })
    expect(result.id).toBe('f1')
  })

  it('defaults page to null when not provided', async () => {
    mockFeedback.create.mockResolvedValue({ id: 'f2' })
    await submitFeedback('user-1', 'no page here')
    expect(mockFeedback.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', message: 'no page here', page: null },
    })
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

  it('resolves a cursor to its createdAt and applies the keyset filter', async () => {
    const cursorCreatedAt = new Date('2024-01-01')
    mockFeedback.findUnique.mockResolvedValue({ createdAt: cursorCreatedAt })
    mockFeedback.findMany.mockResolvedValue([])
    mockFeedback.count.mockResolvedValue(0)

    await listFeedback({ cursor: 'f1' })

    expect(mockFeedback.findUnique).toHaveBeenCalledWith({
      where: { id: 'f1' },
      select: { createdAt: true },
    })
    expect(mockFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
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
