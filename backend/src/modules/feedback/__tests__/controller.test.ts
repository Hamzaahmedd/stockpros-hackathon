jest.mock('../service', () => ({
  listFeedback: jest.fn(),
  submitFeedback: jest.fn(),
}))

import { listFeedback, submitFeedback } from '../service'
import { createFeedback, getAllFeedback } from '../controller'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}
const mockReq = (overrides: Record<string, any> = {}) => ({
  user: { userId: 'user-1' },
  body: {},
  query: {},
  ...overrides,
})
const next = jest.fn()

beforeEach(() => jest.clearAllMocks())

describe('createFeedback', () => {
  it('submits feedback and reports 201', async () => {
    ;(submitFeedback as jest.Mock).mockResolvedValue({ id: 'f1' })
    const req = mockReq({ body: { message: 'Great app!', page: '/dashboard' } })
    const res = mockRes()
    await createFeedback(req as any, res, next)
    expect(submitFeedback).toHaveBeenCalledWith(
      'user-1',
      'Great app!',
      '/dashboard',
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('rejects an empty message', async () => {
    const req = mockReq({ body: { message: '' } })
    const res = mockRes()
    await createFeedback(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getAllFeedback', () => {
  it('returns paginated feedback', async () => {
    ;(listFeedback as jest.Mock).mockResolvedValue({
      data: [{ id: 'f1' }],
      nextCursor: null,
      hasMore: false,
      total: 1,
    })
    const req = mockReq({ query: { limit: '10' } })
    const res = mockRes()
    await getAllFeedback(req as any, res, next)
    expect(listFeedback).toHaveBeenCalledWith({ limit: 10 })
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1 }))
  })

  it('rejects an invalid cursor', async () => {
    const req = mockReq({ query: { cursor: 'not-a-uuid' } })
    const res = mockRes()
    await getAllFeedback(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
