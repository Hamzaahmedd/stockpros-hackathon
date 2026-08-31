import { NotFoundError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import {
  DASHBOARD_IMPACT_NEWS_HOURS,
  DASHBOARD_IMPACT_NEWS_LIMIT,
  DASHBOARD_SECTOR_CACHE_KEY,
  DASHBOARD_SECTOR_CACHE_TTL,
  DASHBOARD_SMART_TRIGGER_LIMIT,
  HEALTH_SCORE_WEIGHTS,
  OVEREXPOSURE_THRESHOLD,
} from './constants'
import type {
  DashboardBriefing,
  DashboardPortfolio,
  DashboardResponse,
  HealthScore,
  ImpactNewsItem,
  SectorHeatmapItem,
  SectorSignal,
  SmartTrigger,
  SmartTriggerType,
  TriggerUrgency,
} from './types'

import { getCache, setCache } from '../../shared/infrastructure/cache'
import yahoo from '../../shared/infrastructure/clients/yahoo-finance-client'
import { getPakistanHour } from '../../shared/utils'
import { getLatestDecisionRun } from '../decision-support'
import type { RankedStockRow } from '../market'
import { getCurrentPrice, getRankedTopStocks } from '../market'

// ─── Briefing ─────────────────────────────────────────────────────────────────

const buildBriefing = async (
  userId: string,
  displayName: string,
): Promise<DashboardBriefing> => {
  const hour = getPakistanHour()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const greeting = `Good ${timeOfDay}, ${displayName}`

  const [lastRun, watchlistItems] = await Promise.all([
    getLatestDecisionRun(userId),
    prisma.watchlist.findMany({
      where: { userId },
      select: { symbol: true, targetEntryPrice: true, stopLoss: true },
    }),
  ])

  // Decision support section
  let decisionSupport: DashboardBriefing['decisionSupport']

  if (!lastRun) {
    decisionSupport = {
      available: false,
      reason: 'NO_DECISION_RUN',
      summary: null,
      headline: null,
    }
  } else {
    const results = lastRun.results
    const buySignals = results.filter(
      (r) => r.portfolioDecision === 'ADD' || r.marketDecision === 'BUY',
    ).length
    const holdSignals = results.filter(
      (r) => r.portfolioDecision === 'HOLD',
    ).length
    const trimSignals = results.filter(
      (r) => r.portfolioDecision === 'TRIM' || r.portfolioDecision === 'EXIT',
    ).length
    const positionsAtRisk = results.filter((r) => r.riskLevel === 'HIGH').length

    const headline =
      [
        buySignals > 0
          ? `${buySignals} position${buySignals > 1 ? 's have' : ' has'} a BUY signal`
          : null,
        positionsAtRisk > 0
          ? `${positionsAtRisk} position${positionsAtRisk > 1 ? 's' : ''} need${positionsAtRisk === 1 ? 's' : ''} attention`
          : null,
      ]
        .filter(Boolean)
        .join('. ') || 'Your portfolio is stable'

    decisionSupport = {
      available: true,
      reason: null,
      summary: {
        buySignals,
        holdSignals,
        trimSignals,
        positionsAtRisk,
        lastRunAt: lastRun.runAt,
      },
      headline,
    }
  }

  // Portfolio alert section — watchlist signals
  const symbolsWithPrice = await Promise.all(
    watchlistItems.map(async (item) => {
      const priceData = await getCurrentPrice(item.symbol)
      return { ...item, currentPrice: priceData?.price ?? null }
    }),
  )

  const stopLossBreaches = symbolsWithPrice.filter(
    (item) =>
      item.stopLoss !== null &&
      item.currentPrice !== null &&
      item.currentPrice <= item.stopLoss,
  ).length

  const entryZonesActive = symbolsWithPrice.filter(
    (item) =>
      item.targetEntryPrice !== null &&
      item.currentPrice !== null &&
      item.currentPrice <= item.targetEntryPrice * 1.02,
  ).length

  // Overexposed sectors from latest decision run
  const overexposedSectors: string[] = []
  if (lastRun) {
    const sectorMap = new Map<string, number>()
    lastRun.results.forEach((r) => {
      const exp = r.exposure as { sectorPercent: number }
      if (r.sector) sectorMap.set(r.sector, exp.sectorPercent)
    })
    sectorMap.forEach((pct, sector) => {
      if (pct > OVEREXPOSURE_THRESHOLD) overexposedSectors.push(sector)
    })
  }

  const portfolioAlertParts: string[] = []
  if (overexposedSectors.length > 0)
    portfolioAlertParts.push(
      `Your portfolio is heavily overexposed to ${overexposedSectors.join(', ')}`,
    )
  if (stopLossBreaches > 0)
    portfolioAlertParts.push(
      `${stopLossBreaches} stop loss${stopLossBreaches > 1 ? 'es' : ''} breached`,
    )
  if (entryZonesActive > 0)
    portfolioAlertParts.push(
      `${entryZonesActive} symbol${entryZonesActive > 1 ? 's are' : ' is'} in entry zone`,
    )

  const portfolioAlert = {
    overexposedSectors,
    stopLossBreaches,
    entryZonesActive,
    headline: portfolioAlertParts.join('. ') || 'No immediate portfolio alerts',
  }

  return {
    greeting,
    generatedAt: new Date().toISOString(),
    decisionSupport,
    portfolioAlert,
  }
}

// ─── Portfolio Snapshot ───────────────────────────────────────────────────────

const computeHealthScore = async (
  userId: string,
  positions: Array<{
    symbol: string
    sector: string | null
    avgEntryPrice: number
    quantity: number
  }>,
  lastRun: Awaited<ReturnType<typeof getLatestDecisionRun>>,
  totalValue: number,
): Promise<HealthScore> => {
  // Diversification — penalty for any sector > 30%
  const sectorMap = new Map<string, number>()
  positions.forEach((p) => {
    const sector = p.sector ?? 'Unknown'
    const val = p.quantity * p.avgEntryPrice
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + val)
  })
  const maxSectorPct =
    totalValue > 0
      ? Math.max(
          ...Array.from(sectorMap.values()).map((v) => (v / totalValue) * 100),
        )
      : 0
  const diversificationScore =
    maxSectorPct > 30 ? Math.max(0, 100 - (maxSectorPct - 30) * 2) : 100

  // Risk/reward — % of positions with positive P&L
  const positivePnLCount = positions.filter((p) => {
    const priceData = null // will be enriched below
    return true
  }).length
  // Use decision run results for riskReward if available
  let riskRewardScore = 70
  let volatilityScore = 70
  if (lastRun?.results.length) {
    const positiveDecisions = lastRun.results.filter(
      (r) => r.portfolioDecision === 'ADD' || r.portfolioDecision === 'HOLD',
    ).length
    riskRewardScore = Math.round(
      (positiveDecisions / lastRun.results.length) * 100,
    )
    const highRiskCount = lastRun.results.filter(
      (r) => r.riskLevel === 'HIGH',
    ).length
    volatilityScore = Math.max(
      0,
      100 - (highRiskCount / lastRun.results.length) * 100,
    )
  }

  // Alert health — penalty for stop loss breaches
  const watchlistItems = await prisma.watchlist.findMany({
    where: { userId },
    select: { symbol: true, stopLoss: true, targetEntryPrice: true },
  })
  const breachCount = await Promise.all(
    watchlistItems.map(async (item) => {
      if (!item.stopLoss) return false
      const priceData = await getCurrentPrice(item.symbol)
      return priceData && priceData.price <= item.stopLoss
    }),
  ).then((results) => results.filter(Boolean).length)

  const alertHealthScore = Math.max(0, 100 - breachCount * 20)

  // Watchlist discipline — % of items with both entry + stop loss set
  const disciplinedCount = watchlistItems.filter(
    (item) => item.targetEntryPrice !== null && item.stopLoss !== null,
  ).length
  const watchlistDisciplineScore =
    watchlistItems.length > 0
      ? Math.round((disciplinedCount / watchlistItems.length) * 100)
      : 100

  const score = Math.round(
    diversificationScore * HEALTH_SCORE_WEIGHTS.diversification +
      riskRewardScore * HEALTH_SCORE_WEIGHTS.riskReward +
      volatilityScore * HEALTH_SCORE_WEIGHTS.volatility +
      alertHealthScore * HEALTH_SCORE_WEIGHTS.alertHealth +
      watchlistDisciplineScore * HEALTH_SCORE_WEIGHTS.watchlistDiscipline,
  )

  const band =
    score >= 80
      ? 'Excellent'
      : score >= 60
        ? 'Good'
        : score >= 40
          ? 'Fair'
          : 'Poor'
  const label =
    score >= 80
      ? 'Your portfolio is well-structured'
      : score >= 60
        ? 'Minor optimizations available'
        : score >= 40
          ? 'Some risks need attention'
          : 'Significant portfolio risks detected'

  return {
    score,
    band,
    label,
    breakdown: {
      diversification: Math.round(diversificationScore),
      riskReward: Math.round(riskRewardScore),
      volatility: Math.round(volatilityScore),
      alertHealth: Math.round(alertHealthScore),
      watchlistDiscipline: Math.round(watchlistDisciplineScore),
    },
  }
}

const buildPortfolioSection = async (
  userId: string,
  lastRun: Awaited<ReturnType<typeof getLatestDecisionRun>>,
): Promise<DashboardPortfolio> => {
  const portfolios = await prisma.portfolio.findMany({
    where: { userId },
    include: { positions: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
  })

  if (portfolios.length === 0 || portfolios[0].positions.length === 0) {
    return { available: false, reason: 'NO_POSITIONS' }
  }

  const positions = portfolios[0].positions

  const priceDataMap = new Map<
    string,
    { price: number; changePercent: number }
  >()
  await Promise.all(
    positions.map(async (p) => {
      const priceData = await getCurrentPrice(p.symbol)
      if (priceData) priceDataMap.set(p.symbol, priceData)
    }),
  )

  let totalValue = 0
  let totalCost = 0
  let todayGainLoss = 0
  let bestPct = -Infinity
  let worstPct = Infinity
  let bestSymbol = ''
  let worstSymbol = ''

  positions.forEach((p) => {
    const priceData = priceDataMap.get(p.symbol)
    const currentPrice = priceData?.price ?? p.avgEntryPrice
    const changePercent = priceData?.changePercent ?? 0

    const positionValue = p.quantity * currentPrice
    const positionCost = p.quantity * p.avgEntryPrice
    const todayChange = positionValue * (changePercent / 100)

    totalValue += positionValue
    totalCost += positionCost
    todayGainLoss += todayChange

    if (changePercent > bestPct) {
      bestPct = changePercent
      bestSymbol = p.symbol
    }
    if (changePercent < worstPct) {
      worstPct = changePercent
      worstSymbol = p.symbol
    }
  })

  const totalUnrealizedPnL = totalValue - totalCost
  const totalUnrealizedPnLPct =
    totalCost > 0 ? (totalUnrealizedPnL / totalCost) * 100 : 0
  const todayGainLossPct =
    totalValue > 0 ? (todayGainLoss / totalValue) * 100 : 0

  const healthScore = await computeHealthScore(
    userId,
    positions,
    lastRun,
    totalCost,
  )

  return {
    available: true,
    totalValue: Number(totalValue.toFixed(2)),
    totalUnrealizedPnL: Number(totalUnrealizedPnL.toFixed(2)),
    totalUnrealizedPnLPct: Number(totalUnrealizedPnLPct.toFixed(2)),
    todayGainLoss: Number(todayGainLoss.toFixed(2)),
    todayGainLossPct: Number(todayGainLossPct.toFixed(2)),
    bestPerformer: bestSymbol
      ? { symbol: bestSymbol, changePercent: Number(bestPct.toFixed(2)) }
      : null,
    worstPerformer: worstSymbol
      ? { symbol: worstSymbol, changePercent: Number(worstPct.toFixed(2)) }
      : null,
    healthScore,
  }
}

// ─── Impact News ──────────────────────────────────────────────────────────────

const buildImpactNews = async (
  userId: string,
): Promise<{ items: ImpactNewsItem[]; totalCount: number }> => {
  const since = new Date(
    Date.now() - DASHBOARD_IMPACT_NEWS_HOURS * 60 * 60 * 1000,
  )

  const [portfolios, watchlistItems] = await Promise.all([
    prisma.portfolio.findMany({
      where: { userId },
      include: { positions: { select: { symbol: true, quantity: true } } },
    }),
    prisma.watchlist.findMany({ where: { userId }, select: { symbol: true } }),
  ])

  const portfolioSymbolMap = new Map<string, number>()
  portfolios
    .flatMap((p) => p.positions)
    .forEach((pos) => portfolioSymbolMap.set(pos.symbol, pos.quantity))
  const watchlistSymbols = new Set(watchlistItems.map((w) => w.symbol))
  const allSymbols = [
    ...Array.from(portfolioSymbolMap.keys()),
    ...Array.from(watchlistSymbols),
  ]

  if (allSymbols.length === 0) return { items: [], totalCount: 0 }

  const articles = await prisma.newsArticle.findMany({
    where: {
      publishedAt: { gte: since },
      sentiment: { in: ['BULLISH', 'BEARISH'] },
      relatedSymbols: { hasSome: allSymbols },
    },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      headline: true,
      sentiment: true,
      relatedSymbols: true,
      publishedAt: true,
      source: true,
      url: true,
    },
  })

  const items: ImpactNewsItem[] = articles
    .map((article) => {
      const matchedPortfolioSymbol = article.relatedSymbols.find((s) =>
        portfolioSymbolMap.has(s),
      )
      const matchedWatchlistSymbol = article.relatedSymbols.find((s) =>
        watchlistSymbols.has(s),
      )
      const primarySymbol =
        matchedPortfolioSymbol ??
        matchedWatchlistSymbol ??
        article.relatedSymbols[0]
      const sharesHeld = matchedPortfolioSymbol
        ? (portfolioSymbolMap.get(matchedPortfolioSymbol) ?? null)
        : null

      let impact: ImpactNewsItem['impact']
      if (matchedPortfolioSymbol) {
        impact =
          article.sentiment === 'BEARISH'
            ? 'NEGATIVE_HOLDING'
            : 'POSITIVE_HOLDING'
      } else {
        impact =
          article.sentiment === 'BEARISH'
            ? 'NEGATIVE_WATCHLIST'
            : 'POSITIVE_WATCHLIST'
      }

      return {
        id: article.id,
        headline: article.headline,
        sentiment: article.sentiment as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
        symbol: primarySymbol,
        impact,
        sharesHeld,
        publishedAt: article.publishedAt,
        source: article.source,
        url: article.url,
      }
    })
    // Portfolio holdings take priority over watchlist
    .sort((a, b) => {
      const aPriority =
        a.impact === 'NEGATIVE_HOLDING' || a.impact === 'POSITIVE_HOLDING'
          ? 0
          : 1
      const bPriority =
        b.impact === 'NEGATIVE_HOLDING' || b.impact === 'POSITIVE_HOLDING'
          ? 0
          : 1
      return aPriority - bPriority
    })

  return {
    items: items.slice(0, DASHBOARD_IMPACT_NEWS_LIMIT),
    totalCount: items.length,
  }
}

// ─── Smart Triggers ───────────────────────────────────────────────────────────

const buildSmartTriggers = async (
  userId: string,
): Promise<{ items: SmartTrigger[]; totalCount: number }> => {
  const [watchlistItems, portfolios] = await Promise.all([
    prisma.watchlist.findMany({
      where: { userId },
      select: {
        symbol: true,
        targetEntryPrice: true,
        stopLoss: true,
        aiSuggestedEntry: true,
        aiConfidence: true,
      },
    }),
    prisma.portfolio.findMany({
      where: { userId },
      include: {
        positions: {
          select: { symbol: true, quantity: true, avgEntryPrice: true },
        },
      },
    }),
  ])

  const positionMap = new Map<
    string,
    { quantity: number; avgEntryPrice: number }
  >()
  portfolios
    .flatMap((p) => p.positions)
    .forEach((pos) =>
      positionMap.set(pos.symbol, {
        quantity: pos.quantity,
        avgEntryPrice: pos.avgEntryPrice,
      }),
    )

  const triggers: SmartTrigger[] = []

  // Price-based triggers from priceCache
  for (const item of watchlistItems) {
    const priceData = await getCurrentPrice(item.symbol)
    if (!priceData) continue

    const { price, changePercent } = priceData
    const position = positionMap.get(item.symbol)

    // Stop loss breached
    if (item.stopLoss && price <= item.stopLoss) {
      const pnlPct = position
        ? (
            ((price - position.avgEntryPrice) / position.avgEntryPrice) *
            100
          ).toFixed(1)
        : null
      triggers.push({
        type: 'STOP_LOSS_BREACHED',
        symbol: item.symbol,
        urgency: 'HIGH',
        message: `${item.symbol} has breached your stop loss of $${item.stopLoss.toFixed(2)}`,
        context: pnlPct
          ? `Current price: $${price.toFixed(2)}. You are down ${Math.abs(Number(pnlPct))}% on this position`
          : `Current price: $${price.toFixed(2)}`,
        action: 'Consider exiting or adjusting your stop loss',
      })
    }

    // Entry zone
    if (item.targetEntryPrice && price <= item.targetEntryPrice * 1.02) {
      triggers.push({
        type: 'ENTRY_ZONE',
        symbol: item.symbol,
        urgency: 'MEDIUM',
        message: `${item.symbol} is within 2% of your target entry price`,
        context: `Target entry: $${item.targetEntryPrice.toFixed(2)}. Current price: $${price.toFixed(2)}`,
        action: item.aiSuggestedEntry
          ? `AI suggested entry: $${item.aiSuggestedEntry.toFixed(2)} with ${item.aiConfidence} confidence`
          : 'Review your trade plan before entering',
      })
    }

    // Strong daily move
    if (changePercent <= -5) {
      triggers.push({
        type: 'PCT_CHANGE_DOWN',
        symbol: item.symbol,
        urgency: 'HIGH',
        message: `${item.symbol} is down ${Math.abs(changePercent).toFixed(1)}% today`,
        context: `Current price: $${price.toFixed(2)}`,
        action: 'Review your stop loss level',
      })
    } else if (changePercent >= 5) {
      triggers.push({
        type: 'PCT_CHANGE_UP',
        symbol: item.symbol,
        urgency: 'MEDIUM',
        message: `${item.symbol} is up ${changePercent.toFixed(1)}% today`,
        context: `Current price: $${price.toFixed(2)}`,
        action: 'Consider reviewing your take profit target',
      })
    }
  }

  // Event-based triggers from alert logs (fired in last 24h by cron jobs)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentAlertLogs = await prisma.alertLog.findMany({
    where: { firedAt: { gte: since }, alert: { userId } },
    include: {
      alert: {
        include: { watchlist: { select: { symbol: true } } },
      },
    },
    orderBy: { firedAt: 'desc' },
    take: 20,
  })

  const eventTriggerMap: Record<
    string,
    {
      type: SmartTriggerType
      urgency: TriggerUrgency
      message: string
      action: string
    }
  > = {
    EARNINGS_APPROACHING: {
      type: 'EARNINGS_APPROACHING',
      urgency: 'HIGH',
      message: 'reports earnings soon',
      action: 'Review your position before the report',
    },
    DIVIDEND_APPROACHING: {
      type: 'DIVIDEND_APPROACHING',
      urgency: 'MEDIUM',
      message: 'has a dividend ex-date approaching',
      action: 'Ensure you hold through ex-date to qualify',
    },
    ANALYST_RATING_CHANGE: {
      type: 'ANALYST_RATING_CHANGE',
      urgency: 'MEDIUM',
      message: 'analyst rating has changed',
      action: 'Review the updated analyst consensus',
    },
    AI_SIGNAL_CHANGED: {
      type: 'AI_SIGNAL_CHANGED',
      urgency: 'LOW',
      message: 'AI suggested zones updated',
      action: 'Review the updated trade plan',
    },
  }

  for (const log of recentAlertLogs) {
    const alertType = log.alert.type
    const symbol = log.alert.watchlist.symbol
    const template = eventTriggerMap[alertType]
    if (!template) continue

    const position = positionMap.get(symbol)
    let context = ''
    if (position) {
      const priceData = await getCurrentPrice(symbol)
      if (priceData) {
        const pnlPct = (
          ((priceData.price - position.avgEntryPrice) /
            position.avgEntryPrice) *
          100
        ).toFixed(1)
        context = `You are currently ${Number(pnlPct) >= 0 ? 'up' : 'down'} ${Math.abs(Number(pnlPct))}% on this position`
      }
    }

    triggers.push({
      type: template.type,
      symbol,
      urgency: template.urgency,
      message: `${symbol} ${template.message}`,
      context: context || `Check your watchlist for details`,
      action: template.action,
    })
  }

  // Sort by urgency: HIGH → MEDIUM → LOW
  const urgencyOrder: Record<TriggerUrgency, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2,
  }
  triggers.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency])

  const unique = triggers.filter(
    (t, i) =>
      triggers.findIndex((x) => x.type === t.type && x.symbol === t.symbol) ===
      i,
  )

  return {
    items: unique.slice(0, DASHBOARD_SMART_TRIGGER_LIMIT),
    totalCount: unique.length,
  }
}

// ─── Sector Heatmap ───────────────────────────────────────────────────────────

// Ensure this matches your existing map
const SECTOR_ETF_MAP: Record<string, string> = {
  'Information Technology': 'XLK',
  'Health Care': 'XLV',
  Financials: 'XLF',
  'Consumer Discretionary': 'XLY',
  'Consumer Staples': 'XLP',
  Energy: 'XLE',
  Industrials: 'XLI',
  Materials: 'XLB',
  'Real Estate': 'XLRE',
  Utilities: 'XLU',
  'Communication Services': 'XLC',
}

export const buildSectorHeatmap = async (userId: string) => {
  // 1. Check for global sector performance cache
  const cached = await getCache<{ cachedAt: string; rawPerformance: any }>(
    DASHBOARD_SECTOR_CACHE_KEY,
  )

  let rawPerformance: Record<string, Record<string, string>> = {
    '1d': {},
    '5d': {},
    '1m': {},
  }
  let cachedAt: string

  if (cached) {
    rawPerformance = cached.rawPerformance
    cachedAt = cached.cachedAt
  } else {
    const sectorEntries = Object.entries(SECTOR_ETF_MAP)

    for (const [sectorName, ticker] of sectorEntries) {
      try {
        const history = await yahoo.chart(ticker, {
          period1: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
          interval: '1d',
        })

        const quotes = history.quotes.filter((q) => q.close !== null)

        if (quotes.length > 20) {
          const current = quotes[quotes.length - 1].close!
          const prev1d = quotes[quotes.length - 2].close!
          const prev5d = quotes[quotes.length - 6].close!
          const prev1m = quotes[0].close!

          const toPct = (now: number, then: number) =>
            (((now - then) / then) * 100).toFixed(2) + '%'

          rawPerformance['1d'][sectorName] = toPct(current, prev1d)
          rawPerformance['5d'][sectorName] = toPct(current, prev5d)
          rawPerformance['1m'][sectorName] = toPct(current, prev1m)
        }

        await new Promise((resolve) => setTimeout(resolve, 250))
      } catch (e) {
        logger.error(
          `Failed to fetch ETF ${ticker} for sector ${sectorName}`,
          e,
        )
      }
    }

    cachedAt = new Date().toISOString()
    await setCache(
      DASHBOARD_SECTOR_CACHE_KEY,
      { rawPerformance, cachedAt },
      DASHBOARD_SECTOR_CACHE_TTL,
    )
  }

  // 2. Calculate User Exposure (Stays the same)
  const portfolios = await prisma.portfolio.findMany({
    where: { userId },
    include: {
      positions: {
        select: {
          symbol: true,
          sector: true,
          quantity: true,
          avgEntryPrice: true,
        },
      },
    },
  })

  const positions = portfolios.flatMap((p) => p.positions)
  const totalValue = positions.reduce(
    (sum, p) => sum + p.quantity * p.avgEntryPrice,
    0,
  )
  const sectorValueMap = new Map<string, { value: number; symbols: string[] }>()

  positions.forEach((p) => {
    const sector = p.sector ?? 'Unknown'
    const val = p.quantity * p.avgEntryPrice
    const entry = sectorValueMap.get(sector) ?? { value: 0, symbols: [] }
    entry.value += val
    if (!entry.symbols.includes(p.symbol)) entry.symbols.push(p.symbol)
    sectorValueMap.set(sector, entry)
  })

  const parsePercent = (str: string): number => {
    if (!str) return 0
    return parseFloat(str.replace('%', '')) || 0
  }

  const sectors: SectorHeatmapItem[] = Object.entries(SECTOR_ETF_MAP).map(
    ([sectorName]) => {
      const perf1d = parsePercent(rawPerformance['1d']?.[sectorName] ?? '')
      const perf5d = parsePercent(rawPerformance['5d']?.[sectorName] ?? '')
      const perf1m = parsePercent(rawPerformance['1m']?.[sectorName] ?? '')

      const exposure = sectorValueMap.get(sectorName)
      const userExposurePct =
        totalValue > 0 && exposure
          ? Number(((exposure.value / totalValue) * 100).toFixed(1))
          : 0
      const userSymbols = exposure?.symbols ?? []

      let signal: SectorSignal
      if (userExposurePct === 0) {
        signal = perf1d > 1 ? 'BLIND_SPOT' : 'NO_EXPOSURE'
      } else if (userExposurePct > 25 && perf1d < 0) {
        // Using 25% as threshold
        signal = 'OVEREXPOSED'
      } else if (perf1d > 0) {
        signal = 'WELL_POSITIONED'
      } else if (perf1d < 0) {
        signal = 'UNDERPERFORMING'
      } else {
        signal = 'NEUTRAL'
      }

      return {
        name: sectorName,
        performance: { '1d': perf1d, '5d': perf5d, '1m': perf1m },
        userExposurePct,
        userSymbols,
        signal,
      }
    },
  )

  return { cachedAt, sectors }
}

// ─── Trending Stocks ──────────────────────────────────────────────────────────

const buildTrendingStocks = async (): Promise<RankedStockRow[]> => {
  try {
    const stocks = await getRankedTopStocks()
    const top = stocks.slice(0, 3)

    return Promise.all(
      top.map(async (stock) => {
        try {
          const history = await yahoo.chart(stock.symbol, {
            period1: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
            interval: '1d',
          })
          const sparkline = history.quotes
            .filter((q) => q.close !== null)
            .map((q) => q.close as number)

          return { ...stock, sparkline }
        } catch (e) {
          logger.error(`Failed to fetch sparkline for ${stock.symbol}`, e)
          return { ...stock, sparkline: [] }
        }
      }),
    )
  } catch (err) {
    logger.error('Failed to build trending stocks', err)
    return []
  }
}

// ─── Main Dashboard Assembler ─────────────────────────────────────────────────

export const getDashboard = async (
  userId: string,
): Promise<DashboardResponse> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  })
  if (!user) throw new NotFoundError('User not found')

  const lastRun = await getLatestDecisionRun(userId)

  const [
    briefing,
    portfolio,
    impactNews,
    smartTriggers,
    sectorHeatmap,
    trendingStocks,
  ] = await Promise.all([
    buildBriefing(userId, user.displayName),
    buildPortfolioSection(userId, lastRun),
    buildImpactNews(userId),
    buildSmartTriggers(userId),
    buildSectorHeatmap(userId),
    buildTrendingStocks(),
  ])

  return {
    briefing,
    portfolio,
    impactNews,
    smartTriggers,
    sectorHeatmap,
    trendingStocks,
  }
}
