import { prisma } from '../../shared/infrastructure/database'
import { NewsSentiment, UserStatus } from '@prisma/client'
import { logger } from '../../shared/infrastructure/logger'
import { SocketServer } from '../../shared/infrastructure/realtime/socket-server'
import { transporter } from '../../shared/infrastructure/config/email'
import finnhubClient from '../../shared/infrastructure/clients/finnhub-client'
import {
  buildPremarketDigestHtml,
  buildPremarketDigestText,
  type PremarketDigestData,
  type WatchlistDigestItem,
} from './email-templates'
import { enrichNewsWithGroq } from './groq-enricher'
import config from '@/config'
import {
  formatPakistanTimestamp,
  getPakistanGreeting,
} from '../../shared/utils'

const NEWS_WATCHLIST_PATH = '/news?filter=watchlist'

/**
 * Compile pre-market briefing data for a given user.
 */
const generateDigestDataForUser = async (
  userId: string,
): Promise<PremarketDigestData | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, email: true },
  })

  if (!user) return null

  // 1. Fetch user's active watchlist symbols
  const watchlistEntries = await prisma.watchlist.findMany({
    where: { userId },
    select: { symbol: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  const symbols = Array.from(new Set(watchlistEntries.map((w) => w.symbol)))

  // 2. Fetch prices/changes for watchlist symbols
  const watchlistItems: WatchlistDigestItem[] = []
  for (const symbol of symbols) {
    try {
      const quoteRes = await finnhubClient.get<{
        c: number // current price
        dp: number // percent change
      }>('/quote', { params: { symbol } })

      watchlistItems.push({
        symbol,
        currentPrice:
          typeof quoteRes.data?.c === 'number' ? quoteRes.data.c : null,
        changePercent:
          typeof quoteRes.data?.dp === 'number' ? quoteRes.data.dp : null,
      })
    } catch {
      watchlistItems.push({
        symbol,
        currentPrice: null,
        changePercent: null,
      })
    }
  }

  // 3. Fetch recent news for these symbols — use stored bullets as both content and fallback
  const rawArticles =
    symbols.length > 0
      ? await prisma.newsArticle.findMany({
          where: { relatedSymbols: { hasSome: symbols } },
          orderBy: { publishedAt: 'desc' },
          take: 4,
          select: {
            headline: true,
            summaryBullets: true,
            sentiment: true,
            relatedSymbols: true,
            source: true,
            url: true,
          },
        })
      : []

  // Map articles to the enricher input shape, carrying fallback bullets
  const enricherInput = rawArticles.map((article) => {
    const matchedSymbol =
      symbols.find((s) => article.relatedSymbols.includes(s)) ??
      article.relatedSymbols[0] ??
      'MARKET'

    const mappedSentiment: NewsSentiment | null = article.sentiment

    // Reconstruct a text body from stored bullets since raw article text is not persisted.
    // Groq will re-distil these into higher-quality, more investment-specific bullets.
    const reconstructedBody = article.summaryBullets.join('. ')

    return {
      symbol: matchedSymbol,
      headline: article.headline,
      rawSummary: reconstructedBody,
      sentiment: mappedSentiment,
      source: article.source ?? undefined,
      url: article.url ?? undefined,
    }
  })

  const fallbackBullets = rawArticles.map((a) => a.summaryBullets ?? [])

  // Attempt Groq enrichment; falls back to stored summaryBullets automatically
  const topNews = await enrichNewsWithGroq(enricherInput, fallbackBullets)

  const generatedAt = new Date()

  return {
    userName: user.displayName || 'Trader',
    greeting: getPakistanGreeting(generatedAt),
    issuedAtFormatted: formatPakistanTimestamp(generatedAt),
    dashboardUrl: `${config.server.frontendUrl}${NEWS_WATCHLIST_PATH}`,
    watchlistItems,
    topNews,
  }
}

/**
 * Generate and send the pre-market digest to a specific user via email + in-app notification.
 */
export const sendPremarketDigestToUser = async (
  userId: string,
): Promise<{ success: boolean; message: string }> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      inAppAlertsEnabled: true,
    },
  })

  if (!user) {
    return { success: false, message: 'User not found' }
  }

  const digestData = await generateDigestDataForUser(userId)
  if (!digestData) {
    return { success: false, message: 'Unable to compile digest data' }
  }

  const subject = `StockPros Pre-Market Briefing [${digestData.issuedAtFormatted}]`
  const textContent = buildPremarketDigestText(digestData)
  const htmlContent = buildPremarketDigestHtml(digestData)

  // 1. Deliver Email via configured transport (Gmail SMTP / Resend / Dev Fallback)
  try {
    await transporter.sendMail({
      to: user.email,
      subject,
      text: textContent,
      html: htmlContent,
    })
    logger.info(`[DigestService] Sent premarket digest to ${user.email}`)
  } catch (err: unknown) {
    logger.error(`[DigestService] Failed to send email to ${user.email}:`, err)
  }

  // 2. Create an in-app notification only when the user has enabled it.
  if (user.inAppAlertsEnabled) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId,
          title: 'Daily Pre-Market Digest Ready',
          body: `Your morning intelligence scan for ${digestData.watchlistItems.length} watchlist symbols is ready.`,
        },
      })

      // 3. Emit real-time WebSocket event
      const socketServer = SocketServer.getInstance()
      if (socketServer) {
        socketServer.io.to(`user:${userId}`).emit('notification', {
          ...notification,
          read: false,
        })
      }
    } catch (err) {
      logger.error(
        `[DigestService] Failed to create in-app notification for user ${userId}:`,
        err,
      )
    }
  }

  return {
    success: true,
    message: `Pre-market digest dispatched to ${user.email}`,
  }
}

/**
 * Scheduled job: dispatches morning digest to all active users with watchlist items.
 */
export const sendDailyDigestsToAllSubscribers = async (): Promise<void> => {
  logger.info(
    '[DigestService] Starting daily pre-market digest dispatch run...',
  )

  try {
    const eligibleUsers = await prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        dailyDigestEnabled: true,
        watchlistItems: { some: {} },
      },
      select: { id: true, email: true },
    })

    logger.info(
      `[DigestService] Found ${eligibleUsers.length} subscribers eligible for morning digest`,
    )

    for (const user of eligibleUsers) {
      try {
        await sendPremarketDigestToUser(user.id)
      } catch (err) {
        logger.error(
          `[DigestService] Error dispatching digest to user ${user.id}:`,
          err,
        )
      }
    }

    logger.info(
      '[DigestService] Completed daily pre-market digest dispatch run',
    )
  } catch (err) {
    logger.error(
      '[DigestService] Daily pre-market digest dispatch job failed:',
      err,
    )
  }
}
