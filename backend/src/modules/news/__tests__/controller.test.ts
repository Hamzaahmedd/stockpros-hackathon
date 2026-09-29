jest.mock('../service', () => ({
  getNewsFeed: jest.fn(),
  getNewsBySymbol: jest.fn(),
  searchNews: jest.fn(),
  getNewsSummary: jest.fn(),
  getSavedNews: jest.fn(),
  markArticleAsRead: jest.fn(),
  markMultipleArticlesAsRead: jest.fn(),
  markAllArticlesAsRead: jest.fn(),
  saveArticle: jest.fn(),
  unsaveArticle: jest.fn(),
}))

import * as NewsService from '../service'
import * as controller from '../controller'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}
const mockReq = (overrides: Record<string, any> = {}) => ({
  user: { userId: 'user-1' },
  query: {},
  params: {},
  body: {},
  ...overrides,
})
const next = jest.fn()
const validId = 'a5b1a111-1111-4111-8111-111111111111'

beforeEach(() => jest.clearAllMocks())

describe('getNewsFeed', () => {
  it('returns the feed with defaults applied', async () => {
    ;(NewsService.getNewsFeed as jest.Mock).mockResolvedValue({
      data: [],
      nextCursor: null,
      hasMore: false,
    })
    const res = mockRes()
    await controller.getNewsFeed(mockReq() as any, res, next)
    expect(NewsService.getNewsFeed).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ filter: 'all' }),
    )
  })

  it('rejects an invalid filter value', async () => {
    const req = mockReq({ query: { filter: 'bogus' } })
    const res = mockRes()
    await controller.getNewsFeed(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getNewsBySymbol', () => {
  it('returns news for the uppercased symbol', async () => {
    ;(NewsService.getNewsBySymbol as jest.Mock).mockResolvedValue({ data: [] })
    const req = mockReq({ params: { symbol: 'aapl' } })
    const res = mockRes()
    await controller.getNewsBySymbol(req as any, res, next)
    expect(NewsService.getNewsBySymbol).toHaveBeenCalledWith(
      'user-1',
      'AAPL',
      expect.any(Object),
    )
  })

  it('rejects a missing symbol param', async () => {
    const req = mockReq({ params: {} })
    const res = mockRes()
    await controller.getNewsBySymbol(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('searchNews', () => {
  it('searches with a valid query', async () => {
    ;(NewsService.searchNews as jest.Mock).mockResolvedValue({ data: [] })
    const req = mockReq({ query: { q: 'earnings' } })
    const res = mockRes()
    await controller.searchNews(req as any, res, next)
    expect(NewsService.searchNews).toHaveBeenCalled()
  })

  it('rejects a too-short search query', async () => {
    const req = mockReq({ query: { q: 'a' } })
    const res = mockRes()
    await controller.searchNews(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getNewsSummary', () => {
  it('returns the summary', async () => {
    ;(NewsService.getNewsSummary as jest.Mock).mockResolvedValue({
      unreadCount: 2,
    })
    const res = mockRes()
    await controller.getNewsSummary(mockReq() as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unreadCount: 2 } }),
    )
  })

  it('forwards a downstream failure to next()', async () => {
    ;(NewsService.getNewsSummary as jest.Mock).mockRejectedValue(new Error('x'))
    const res = mockRes()
    await controller.getNewsSummary(mockReq() as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getSavedNews', () => {
  it('returns saved news', async () => {
    ;(NewsService.getSavedNews as jest.Mock).mockResolvedValue({ data: [] })
    const res = mockRes()
    await controller.getSavedNews(mockReq() as any, res, next)
    expect(NewsService.getSavedNews).toHaveBeenCalled()
  })

  it('rejects an invalid cursor', async () => {
    const req = mockReq({ query: { cursor: 'not-a-uuid' } })
    const res = mockRes()
    await controller.getSavedNews(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('markAsRead', () => {
  it('marks the article as read', async () => {
    ;(NewsService.markArticleAsRead as jest.Mock).mockResolvedValue({
      id: validId,
    })
    const req = mockReq({ params: { id: validId } })
    const res = mockRes()
    await controller.markAsRead(req as any, res, next)
    expect(NewsService.markArticleAsRead).toHaveBeenCalledWith(
      'user-1',
      validId,
    )
  })

  it('rejects an invalid article id', async () => {
    const req = mockReq({ params: { id: 'not-a-uuid' } })
    const res = mockRes()
    await controller.markAsRead(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('markMultipleAsRead', () => {
  it('marks the given articles as read', async () => {
    ;(NewsService.markMultipleArticlesAsRead as jest.Mock).mockResolvedValue({
      updated: 2,
    })
    const req = mockReq({ body: { articleIds: ['a1', 'a2'] } })
    const res = mockRes()
    await controller.markMultipleAsRead(req as any, res, next)
    expect(NewsService.markMultipleArticlesAsRead).toHaveBeenCalledWith(
      'user-1',
      ['a1', 'a2'],
    )
  })

  it('rejects an empty articleIds array', async () => {
    const req = mockReq({ body: { articleIds: [] } })
    const res = mockRes()
    await controller.markMultipleAsRead(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('markAllAsRead', () => {
  it('marks all articles as read', async () => {
    ;(NewsService.markAllArticlesAsRead as jest.Mock).mockResolvedValue({
      updated: 5,
    })
    const res = mockRes()
    await controller.markAllAsRead(mockReq() as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { updated: 5 } }),
    )
  })

  it('forwards a downstream failure to next()', async () => {
    ;(NewsService.markAllArticlesAsRead as jest.Mock).mockRejectedValue(
      new Error('x'),
    )
    const res = mockRes()
    await controller.markAllAsRead(mockReq() as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('saveArticle / unsaveArticle', () => {
  it('saves the article', async () => {
    ;(NewsService.saveArticle as jest.Mock).mockResolvedValue({ id: validId })
    const req = mockReq({ params: { id: validId } })
    const res = mockRes()
    await controller.saveArticle(req as any, res, next)
    expect(NewsService.saveArticle).toHaveBeenCalledWith('user-1', validId)
  })

  it('rejects an invalid id when saving', async () => {
    const req = mockReq({ params: { id: 'nope' } })
    const res = mockRes()
    await controller.saveArticle(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })

  it('unsaves the article', async () => {
    ;(NewsService.unsaveArticle as jest.Mock).mockResolvedValue(undefined)
    const req = mockReq({ params: { id: validId } })
    const res = mockRes()
    await controller.unsaveArticle(req as any, res, next)
    expect(NewsService.unsaveArticle).toHaveBeenCalledWith('user-1', validId)
  })

  it('forwards a downstream unsave failure to next()', async () => {
    ;(NewsService.unsaveArticle as jest.Mock).mockRejectedValue(
      new Error('not found'),
    )
    const req = mockReq({ params: { id: validId } })
    const res = mockRes()
    await controller.unsaveArticle(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
