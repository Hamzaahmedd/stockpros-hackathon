import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedbackCategory, FeedbackStatus } from './types'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock('@/shared/api/axios', () => ({ default: api }))

import { feedbackService } from './services'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('feedbackService', () => {
  it('submits the message with its category and browser context', async () => {
    api.post.mockResolvedValue({ data: { data: { id: 'f1' } } })
    const input = {
      message: 'It broke',
      page: '/forecast',
      category: FeedbackCategory.BUG,
      metadata: { appVersion: '1.0.0' },
    }

    await expect(feedbackService.submit(input)).resolves.toEqual({ id: 'f1' })
    expect(api.post).toHaveBeenCalledWith('/api/v1/feedback', input)
  })

  it('lists with a cursor and a status filter, and reads the counts', async () => {
    api.get.mockResolvedValue({
      data: {
        data: [{ id: 'f1' }],
        extra: {
          nextCursor: 'c1',
          hasMore: true,
          total: 5,
          counts: { NEW: 5, READ: 2, ARCHIVED: 1 },
        },
      },
    })

    const result = await feedbackService.list({
      cursor: 'c0',
      status: FeedbackStatus.NEW,
    })

    expect(api.get).toHaveBeenCalledWith('/api/v1/feedback', {
      params: { cursor: 'c0', status: 'NEW' },
    })
    expect(result).toEqual({
      data: [{ id: 'f1' }],
      nextCursor: 'c1',
      hasMore: true,
      total: 5,
      counts: { NEW: 5, READ: 2, ARCHIVED: 1 },
    })
  })

  it('defaults everything when the response is empty', async () => {
    api.get.mockResolvedValue({ data: {} })
    expect(await feedbackService.list()).toEqual({
      data: [],
      nextCursor: null,
      hasMore: false,
      total: 0,
      counts: { NEW: 0, READ: 0, ARCHIVED: 0 },
    })
    expect(api.get).toHaveBeenCalledWith('/api/v1/feedback', {
      params: { cursor: undefined, status: undefined },
    })
  })

  it('changes the status of one entry', async () => {
    api.patch.mockResolvedValue({ data: { success: true } })
    await feedbackService.setStatus('f1', FeedbackStatus.ARCHIVED)
    expect(api.patch).toHaveBeenCalledWith('/api/v1/feedback/f1/status', {
      status: 'ARCHIVED',
    })
  })
})
