jest.mock('../service', () => ({
  listFeedback: jest.fn(),
  submitFeedback: jest.fn(),
  updateFeedbackStatus: jest.fn(),
}))

import { listFeedback, submitFeedback, updateFeedbackStatus } from '../service'
import {
  createFeedback,
  getAllFeedback,
  setFeedbackStatus,
} from '../controller'

const FEEDBACK_ID = '0191e4a0-0000-7000-8000-000000000001'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}
const mockReq = (overrides: Record<string, any> = {}) => ({
  user: { userId: 'user-1', plan: 'PRO' },
  body: {},
  query: {},
  params: {},
  ...overrides,
})
const next = jest.fn()

beforeEach(() => jest.clearAllMocks())

describe('createFeedback', () => {
  it('submits feedback with the session plan and reports 201', async () => {
    ;(submitFeedback as jest.Mock).mockResolvedValue({ id: 'f1' })
    const req = mockReq({ body: { message: 'Great app!', page: '/dashboard' } })
    const res = mockRes()
    await createFeedback(req as any, res, next)
    expect(submitFeedback).toHaveBeenCalledWith({
      userId: 'user-1',
      planTier: 'PRO',
      message: 'Great app!',
      page: '/dashboard',
      category: undefined,
      clientMetadata: undefined,
    })
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('passes the category and the browser context through', async () => {
    ;(submitFeedback as jest.Mock).mockResolvedValue({ id: 'f1' })
    const metadata = {
      userAgent: 'Mozilla/5.0',
      viewport: { width: 1440, height: 900 },
      appVersion: '1.0.0',
    }
    const req = mockReq({
      body: { message: 'It broke', category: 'BUG', metadata },
    })
    await createFeedback(req as any, mockRes(), next)
    expect(submitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'BUG', clientMetadata: metadata }),
    )
  })

  it('uses the session plan, never one the client claims', async () => {
    ;(submitFeedback as jest.Mock).mockResolvedValue({ id: 'f1' })
    const req = mockReq({
      user: { userId: 'user-1', plan: 'FREE' },
      body: { message: 'hi', metadata: {} },
    })
    await createFeedback(req as any, mockRes(), next)
    expect((submitFeedback as jest.Mock).mock.calls[0][0].planTier).toBe('FREE')

    // A client trying to claim a tier is refused outright.
    const claiming = mockReq({
      body: { message: 'hi', metadata: { planTier: 'TEAM' } },
    })
    await createFeedback(claiming as any, mockRes(), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(submitFeedback).toHaveBeenCalledTimes(1)
  })

  it('falls back to FREE when the session carries no plan', async () => {
    ;(submitFeedback as jest.Mock).mockResolvedValue({ id: 'f1' })
    const req = mockReq({ user: { userId: 'user-1' }, body: { message: 'hi' } })
    await createFeedback(req as any, mockRes(), next)
    expect((submitFeedback as jest.Mock).mock.calls[0][0].planTier).toBe('FREE')
  })

  it('rejects an empty message, an unknown category and oversized metadata', async () => {
    for (const body of [
      { message: '' },
      { message: 'x', category: 'RANT' },
      { message: 'x', metadata: { userAgent: 'u'.repeat(301) } },
    ]) {
      next.mockClear()
      await createFeedback(mockReq({ body }) as any, mockRes(), next)
      expect(next).toHaveBeenCalledWith(expect.any(Error))
    }
    expect(submitFeedback).not.toHaveBeenCalled()
  })

  it('forwards an unauthenticated request to next()', async () => {
    await createFeedback(
      mockReq({ user: undefined, body: { message: 'x' } }) as any,
      mockRes(),
      next,
    )
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getAllFeedback', () => {
  it('returns paginated feedback with the status counts', async () => {
    ;(listFeedback as jest.Mock).mockResolvedValue({
      data: [{ id: 'f1' }],
      nextCursor: null,
      hasMore: false,
      total: 1,
      counts: { NEW: 1, READ: 0, ARCHIVED: 0 },
    })
    const req = mockReq({ query: { limit: '10' } })
    const res = mockRes()
    await getAllFeedback(req as any, res, next)
    expect(listFeedback).toHaveBeenCalledWith({ limit: 10 })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 1,
        counts: { NEW: 1, READ: 0, ARCHIVED: 0 },
      }),
    )
  })

  it('passes a status filter through', async () => {
    ;(listFeedback as jest.Mock).mockResolvedValue({
      data: [],
      nextCursor: null,
      hasMore: false,
      total: 0,
      counts: { NEW: 0, READ: 0, ARCHIVED: 0 },
    })
    await getAllFeedback(
      mockReq({ query: { status: 'ARCHIVED' } }) as any,
      mockRes(),
      next,
    )
    expect(listFeedback).toHaveBeenCalledWith({ limit: 20, status: 'ARCHIVED' })
  })

  it('rejects an invalid cursor or status', async () => {
    for (const query of [{ cursor: 'not-a-uuid' }, { status: 'DONE' }]) {
      next.mockClear()
      await getAllFeedback(mockReq({ query }) as any, mockRes(), next)
      expect(next).toHaveBeenCalledWith(expect.any(Error))
    }
  })
})

describe('setFeedbackStatus', () => {
  it('updates the status as the signed-in admin', async () => {
    ;(updateFeedbackStatus as jest.Mock).mockResolvedValue({
      id: FEEDBACK_ID,
      status: 'READ',
      changed: true,
    })
    const res = mockRes()
    await setFeedbackStatus(
      mockReq({
        user: { userId: 'admin-1', plan: 'FREE' },
        params: { id: FEEDBACK_ID },
        body: { status: 'READ' },
      }) as any,
      res,
      next,
    )
    expect(updateFeedbackStatus).toHaveBeenCalledWith(
      'admin-1',
      FEEDBACK_ID,
      'READ',
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'READ', changed: true }),
      }),
    )
  })

  it('rejects a bad id, a bad status and an unauthenticated caller', async () => {
    for (const req of [
      mockReq({ params: { id: 'x' }, body: { status: 'READ' } }),
      mockReq({ params: { id: FEEDBACK_ID }, body: { status: 'DONE' } }),
      mockReq({
        user: undefined,
        params: { id: FEEDBACK_ID },
        body: { status: 'READ' },
      }),
    ]) {
      next.mockClear()
      await setFeedbackStatus(req as any, mockRes(), next)
      expect(next).toHaveBeenCalledWith(expect.any(Error))
    }
    expect(updateFeedbackStatus).not.toHaveBeenCalled()
  })

  it('forwards a service failure', async () => {
    ;(updateFeedbackStatus as jest.Mock).mockRejectedValue(new Error('gone'))
    await setFeedbackStatus(
      mockReq({
        params: { id: FEEDBACK_ID },
        body: { status: 'READ' },
      }) as any,
      mockRes(),
      next,
    )
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
