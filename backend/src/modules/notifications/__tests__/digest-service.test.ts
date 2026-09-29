jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    watchlist: { findMany: jest.fn() },
    newsArticle: { findMany: jest.fn() },
    notification: { create: jest.fn() },
  },
}))

jest.mock('../../../shared/infrastructure/clients/finnhub-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../../../shared/infrastructure/config/email', () => ({
  transporter: { sendMail: jest.fn() },
  getLogoSrc: jest.fn().mockReturnValue('cid:logo'),
}))

jest.mock('../../../shared/infrastructure/realtime/socket-server', () => ({
  SocketServer: { getInstance: jest.fn() },
}))

jest.mock('../email-templates', () => ({
  buildPremarketDigestHtml: jest.fn().mockReturnValue('<html></html>'),
  buildPremarketDigestText: jest.fn().mockReturnValue('text digest'),
}))

jest.mock('../groq-enricher', () => ({
  enrichNewsWithGroq: jest.fn(),
}))

jest.mock('../../../shared/utils', () => ({
  ...jest.requireActual('../../../shared/utils'),
  formatPakistanTimestamp: jest.fn().mockReturnValue('Jan 1, 8:00 AM PKT'),
  getPakistanGreeting: jest.fn().mockReturnValue('Good morning'),
}))

import { prisma } from '../../../shared/infrastructure/database'
import finnhubClient from '../../../shared/infrastructure/clients/finnhub-client'
import { transporter } from '../../../shared/infrastructure/config/email'
import { SocketServer } from '../../../shared/infrastructure/realtime/socket-server'
import {
  buildPremarketDigestHtml,
  buildPremarketDigestText,
} from '../email-templates'
import { enrichNewsWithGroq } from '../groq-enricher'
import {
  sendDailyDigestsToAllSubscribers,
  sendPremarketDigestToUser,
} from '../digest-service'

const mockPrisma = prisma as unknown as {
  [model: string]: Record<string, jest.Mock>
}
const mockFinnhubGet = (finnhubClient as unknown as { get: jest.Mock }).get

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.watchlist.findMany.mockResolvedValue([])
  mockPrisma.newsArticle.findMany.mockResolvedValue([])
  mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' })
  ;(transporter.sendMail as jest.Mock).mockResolvedValue(undefined)
  ;(enrichNewsWithGroq as jest.Mock).mockResolvedValue([])
  ;(SocketServer.getInstance as jest.Mock).mockReturnValue(null)
})

describe('sendPremarketDigestToUser', () => {
  it('reports failure when the user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const result = await sendPremarketDigestToUser('missing')
    expect(result).toEqual({ success: false, message: 'User not found' })
  })

  it('reports failure when digest data cannot be compiled (user vanished between lookups)', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'a@example.com',
        displayName: 'Ada',
        inAppAlertsEnabled: true,
      })
      .mockResolvedValueOnce(null) // generateDigestDataForUser's own lookup
    const result = await sendPremarketDigestToUser('user-1')
    expect(result).toEqual({
      success: false,
      message: 'Unable to compile digest data',
    })
  })

  it('sends the digest email and creates an in-app notification with a live socket emit', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      displayName: 'Ada',
      inAppAlertsEnabled: true,
      marketInterests: [],
    })
    mockPrisma.watchlist.findMany.mockResolvedValue([{ symbol: 'AAPL' }])
    mockFinnhubGet.mockResolvedValue({ data: { c: 150, dp: 1.2 } })
    const mockIo = { to: jest.fn().mockReturnThis(), emit: jest.fn() }
    ;(SocketServer.getInstance as jest.Mock).mockReturnValue({ io: mockIo })

    const result = await sendPremarketDigestToUser('user-1')

    expect(result).toEqual({
      success: true,
      message: 'Pre-market digest dispatched to a@example.com',
    })
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@example.com', text: 'text digest' }),
    )
    expect(mockPrisma.notification.create).toHaveBeenCalled()
    expect(mockIo.to).toHaveBeenCalledWith('user:user-1')
    expect(mockIo.emit).toHaveBeenCalledWith(
      'notification',
      expect.objectContaining({ read: false }),
    )
  })

  it('still reports success and creates the notification when the socket server has no live instance', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      displayName: 'Ada',
      inAppAlertsEnabled: true,
      marketInterests: [],
    })

    const result = await sendPremarketDigestToUser('user-1')
    expect(result.success).toBe(true)
    expect(mockPrisma.notification.create).toHaveBeenCalled()
  })

  it('skips the in-app notification entirely when the user has disabled it', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      displayName: 'Ada',
      inAppAlertsEnabled: false,
      marketInterests: [],
    })

    await sendPremarketDigestToUser('user-1')
    expect(mockPrisma.notification.create).not.toHaveBeenCalled()
  })

  it('logs and continues (still succeeds) when the email send fails', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      displayName: 'Ada',
      inAppAlertsEnabled: false,
      marketInterests: [],
    })
    ;(transporter.sendMail as jest.Mock).mockRejectedValue(
      new Error('smtp down'),
    )

    const result = await sendPremarketDigestToUser('user-1')
    expect(result.success).toBe(true)
  })

  it('logs and continues when creating the in-app notification fails', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      displayName: 'Ada',
      inAppAlertsEnabled: true,
      marketInterests: [],
    })
    mockPrisma.notification.create.mockRejectedValue(new Error('db down'))

    const result = await sendPremarketDigestToUser('user-1')
    expect(result.success).toBe(true)
  })
})

describe('generateDigestDataForUser (exercised via sendPremarketDigestToUser)', () => {
  const setupUser = (overrides: Record<string, unknown> = {}) => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      displayName: 'Ada',
      inAppAlertsEnabled: false,
      marketInterests: [],
      ...overrides,
    })
  }

  it('deduplicates watchlist symbols and records a null price when the quote lookup fails', async () => {
    setupUser()
    mockPrisma.watchlist.findMany.mockResolvedValue([
      { symbol: 'AAPL' },
      { symbol: 'AAPL' },
      { symbol: 'MSFT' },
    ])
    mockFinnhubGet.mockImplementation((_url: string, config: any) =>
      config.params.symbol === 'MSFT'
        ? Promise.reject(new Error('finnhub down'))
        : Promise.resolve({ data: { c: 150, dp: 1.2 } }),
    )

    await sendPremarketDigestToUser('user-1')

    const [enricherInput] = (enrichNewsWithGroq as jest.Mock).mock.calls[0]
    expect(enricherInput).toEqual([])
    // Watchlist items themselves are asserted via the HTML/text builder call
    expect(buildPremarketDigestHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        watchlistItems: [
          { symbol: 'AAPL', currentPrice: 150, changePercent: 1.2 },
          { symbol: 'MSFT', currentPrice: null, changePercent: null },
        ],
      }),
    )
  })

  it('records a null price/change when the quote payload is missing those numeric fields', async () => {
    setupUser()
    mockPrisma.watchlist.findMany.mockResolvedValue([{ symbol: 'AAPL' }])
    mockFinnhubGet.mockResolvedValue({ data: {} })

    await sendPremarketDigestToUser('user-1')
    expect(buildPremarketDigestHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        watchlistItems: [
          { symbol: 'AAPL', currentPrice: null, changePercent: null },
        ],
      }),
    )
  })

  it('treats a missing marketInterests field the same as an empty list', async () => {
    setupUser({ marketInterests: undefined })
    mockPrisma.watchlist.findMany.mockResolvedValue([{ symbol: 'AAPL' }])
    mockFinnhubGet.mockResolvedValue({ data: { c: 100, dp: 0 } })
    await expect(sendPremarketDigestToUser('user-1')).resolves.toMatchObject({
      success: true,
    })
  })

  it("defaults the greeting's userName to Trader when displayName is blank", async () => {
    setupUser({ displayName: '' })
    await sendPremarketDigestToUser('user-1')
    expect(buildPremarketDigestHtml).toHaveBeenCalledWith(
      expect.objectContaining({ userName: 'Trader' }),
    )
  })

  it('skips the watchlist-article query entirely when the user has no watchlist symbols', async () => {
    setupUser()
    await sendPremarketDigestToUser('user-1')
    expect(mockPrisma.newsArticle.findMany).not.toHaveBeenCalled()
  })

  it('fills remaining slots with interest-matched articles not already pulled from the watchlist', async () => {
    setupUser({ marketInterests: ['energy', 'not_a_real_interest'] })
    mockPrisma.watchlist.findMany.mockResolvedValue([{ symbol: 'AAPL' }])
    mockFinnhubGet.mockResolvedValue({ data: { c: 100, dp: 0 } })
    mockPrisma.newsArticle.findMany
      .mockResolvedValueOnce([
        {
          headline: 'AAPL rallies',
          summaryBullets: ['bullet'],
          sentiment: 'BULLISH',
          relatedSymbols: ['AAPL'],
          source: 'X',
          url: 'https://a',
        },
      ])
      .mockResolvedValueOnce([
        {
          headline: 'Oil prices jump',
          summaryBullets: ['bullet2'],
          sentiment: 'BULLISH',
          relatedSymbols: ['XOM'],
          source: 'Y',
          url: 'https://b',
        },
        {
          headline: 'Duplicate of watchlist article',
          summaryBullets: [],
          sentiment: null,
          relatedSymbols: ['AAPL'],
          source: 'X',
          url: 'https://a', // same url as the watchlist article -> must be excluded
        },
      ])

    await sendPremarketDigestToUser('user-1')

    const [enricherInput] = (enrichNewsWithGroq as jest.Mock).mock.calls[0]
    expect(enricherInput).toHaveLength(2)
    expect(enricherInput.map((a: any) => a.headline)).toEqual([
      'AAPL rallies',
      'Oil prices jump',
    ])
    expect(enricherInput[1].symbol).toBe('XOM')
  })

  it('does not query supplementary articles once the watchlist cap is already filled', async () => {
    setupUser({ marketInterests: ['energy'] })
    mockPrisma.watchlist.findMany.mockResolvedValue([{ symbol: 'AAPL' }])
    mockFinnhubGet.mockResolvedValue({ data: { c: 100, dp: 0 } })
    mockPrisma.newsArticle.findMany.mockResolvedValueOnce(
      Array.from({ length: 4 }, (_, i) => ({
        headline: `Article ${i}`,
        summaryBullets: [],
        sentiment: null,
        relatedSymbols: ['AAPL'],
        source: 'X',
        url: `https://${i}`,
      })),
    )

    await sendPremarketDigestToUser('user-1')
    expect(mockPrisma.newsArticle.findMany).toHaveBeenCalledTimes(1)
  })

  it('falls back to MARKET as the symbol when an article matches no watchlist symbol', async () => {
    setupUser()
    mockPrisma.watchlist.findMany.mockResolvedValue([{ symbol: 'AAPL' }])
    mockFinnhubGet.mockResolvedValue({ data: { c: 100, dp: 0 } })
    mockPrisma.newsArticle.findMany.mockResolvedValueOnce([
      {
        headline: 'General market news',
        summaryBullets: [],
        sentiment: null,
        relatedSymbols: [],
        source: null,
        url: null,
      },
    ])

    await sendPremarketDigestToUser('user-1')
    const [enricherInput] = (enrichNewsWithGroq as jest.Mock).mock.calls[0]
    expect(enricherInput[0].symbol).toBe('MARKET')
  })
})

describe('sendDailyDigestsToAllSubscribers', () => {
  it('dispatches to every eligible subscriber, skipping a failure without aborting the batch', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-1', email: 'a@example.com' },
      { id: 'user-2', email: 'b@example.com' },
    ])
    mockPrisma.user.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.id === 'user-1'
          ? {
              id: 'user-1',
              email: 'a@example.com',
              displayName: 'Ada',
              inAppAlertsEnabled: false,
              marketInterests: [],
            }
          : null, // user-2 fails generateDigestDataForUser's own lookup
      ),
    )

    await expect(sendDailyDigestsToAllSubscribers()).resolves.toBeUndefined()
    expect(transporter.sendMail).toHaveBeenCalledTimes(1)
  })

  it('logs and does not throw when the eligibility query itself fails', async () => {
    mockPrisma.user.findMany.mockRejectedValue(new Error('db down'))
    await expect(sendDailyDigestsToAllSubscribers()).resolves.toBeUndefined()
  })

  it('logs and continues past a subscriber whose digest generation throws outright', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-1', email: 'a@example.com' },
      { id: 'user-2', email: 'b@example.com' },
    ])
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      displayName: 'Ada',
      inAppAlertsEnabled: false,
      marketInterests: [],
    })
    // An unhandled rejection here propagates out of generateDigestDataForUser
    // and sendPremarketDigestToUser itself, exercising the outer per-user
    // catch in the dispatch loop (as opposed to the graceful {success:false}
    // paths sendPremarketDigestToUser handles on its own).
    mockPrisma.watchlist.findMany
      .mockRejectedValueOnce(new Error('db down mid-flow'))
      .mockResolvedValue([])

    await expect(sendDailyDigestsToAllSubscribers()).resolves.toBeUndefined()
    expect(transporter.sendMail).toHaveBeenCalledTimes(1)
  })
})
