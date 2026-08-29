import { parse } from 'csv-parse/sync'
import { RSI } from 'technicalindicators'
import * as xlsx from 'xlsx'
import { validateOrThrow, ValidationError } from '../../shared/errors'
import { CACHE_TTL } from '../../shared/constants/cache-constants'
import { getCache, setCache } from '../../shared/infrastructure/cache'
import finnhubClient from '../../shared/infrastructure/clients/finnhub-client'
import polygonClient from '../../shared/infrastructure/clients/polygon-client'
import yahoo from '../../shared/infrastructure/clients/yahoo-finance-client'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import { getPakistanMonth } from '../../shared/utils'
import { getCompanySectors, getLivePrices, StockQuote } from '../market'
import { mapPolygonCategory, mapPolygonSentiment } from '../news'
import { persistDecisionRun } from './repository'
import {
    ActionGuidance,
    DecisionResult,
    EnrichedPortfolioPosition,
    PortfolioPosition,
    PortfolioSummary,
    RawPortfolioRow,
    RiskLevel,
    VolatilityLevel,
} from './types'
import { PortfolioArrayValidator } from './validation'

export const enrichPortfolio = async (
  rows: RawPortfolioRow[],
): Promise<{
  positions: EnrichedPortfolioPosition[]
  summary: PortfolioSummary
}> => {
  const uniqueSymbols = [
    ...new Set(rows.map((row) => row.symbol.toUpperCase())),
  ]
  const quoteMap = await getLivePrices(uniqueSymbols)
  const sectorMap = await getCompanySectors(uniqueSymbols)

  let totalMarketValue = 0
  let totalCost = 0
  const positions = rows.map((row) => {
    const symbol = row.symbol.toUpperCase()
    const price = quoteMap[symbol] ?? 0
    const currentValue = price * row.quantity
    const cost = row.avg_entry_price * row.quantity
    const pnl = currentValue - cost
    totalMarketValue += currentValue
    totalCost += cost

    return {
      ...row,
      symbol,
      currentPrice: price,
      currentValue: Number(currentValue.toFixed(2)),
      unrealizedPnL: Number(pnl.toFixed(2)),
      unrealizedPnLPercent:
        cost > 0 ? Number(((pnl / cost) * 100).toFixed(2)) : 0,
      sector: sectorMap[symbol] ?? 'Unknown',
    }
  })

  const totalUnrealizedPnL = totalMarketValue - totalCost
  return {
    positions,
    summary: {
      totalPositions: positions.length,
      totalMarketValue: Number(totalMarketValue.toFixed(2)),
      totalUnrealizedPnL: Number(totalUnrealizedPnL.toFixed(2)),
      totalUnrealizedPnLPercent:
        totalCost > 0
          ? Number(((totalUnrealizedPnL / totalCost) * 100).toFixed(2))
          : 0,
    },
  }
}

// ── Market Decision Functions ──
export const getUnifiedMarketDecision = async (symbol: string) => {
  const CACHE_KEY = `market_decision_v1:${symbol}`

  const cached = await getCache<any>(CACHE_KEY)
  if (cached) return cached

  const [quote, closes, ratings, news, marketStatus] = await Promise.all([
    getQuote(symbol),
    getHistoricalCloses(symbol),
    getAnalystRatings(symbol),
    getNews(symbol),
    getMarketStatus(),
  ])

  const rsi = computeRSI(closes)
  const trend = computeTrend(closes)
  const analyst = parseAnalystConsensus(ratings)
  const sentiment = computeSentiment(news, symbol)

  const decision = computeDecision({
    rsi,
    sentimentTrend: sentiment.trend,
    analystRating: analyst.rating,
    sentimentScore: sentiment.score,
    newsVolume: sentiment.newsVolume,
    analystConfidencePercent: analyst.confidencePercent,
    analystSourceCount: analyst.sourceCount,
  })

  const actionGuidance = computeActionGuidance(
    decision.recommendation,
    rsi,
    sentiment.trend,
  )

  const finalData = {
    symbol,
    marketStatus,
    quote,
    rsi,
    trend,
    analyst,
    sentiment,
    decision,
    actionGuidance,
  }

  await setCache(CACHE_KEY, finalData, CACHE_TTL.DECISION_SUPPORT.MARKET_DECISION)
  return finalData
}

export const getMarketDecisionResponse = async (symbol: string) => {
  const marketData = await getUnifiedMarketDecision(symbol)
  const reasoning = generateReasoning({
    rsi: marketData.rsi,
    sentimentTrend: marketData.sentiment.trend,
    sentimentChange48h: marketData.sentiment.change48hPercent,
    analystRating: marketData.analyst.rating,
  })

  return {
    symbol,
    timestamp: new Date().toISOString(),
    marketContext: {
      marketStatus: marketData.marketStatus,
      lastClosePrice: marketData.quote.pc,
    },
    analystConsensus: marketData.analyst,
    priceState: {
      current: marketData.quote.c,
      trend: marketData.trend,
      rsi: marketData.rsi,
      isOverbought: marketData.rsi >= 70,
    },
    sentimentState: marketData.sentiment,
    decision: {
      recommendation: marketData.decision.recommendation,
      timeHorizon: marketData.decision.timeHorizon,
      confidence: marketData.decision.confidence,
    },
    reasoning,
    riskFlags: marketData.decision.riskFlags,
    actionGuidance: marketData.actionGuidance,
  }
}

export const getQuote = async (symbol: string) => {
  const { data } = await finnhubClient.get<StockQuote>(`/quote`, {
    params: { symbol: symbol },
  })
  return data
}

export const getMarketStatus = async () => {
  const { data } = await finnhubClient.get(`/stock/market-status`, {
    params: { exchange: 'US' },
  })
  let marketStatus = 'CLOSED'
  if (data.isOpen) marketStatus = 'OPEN'
  return marketStatus
}

const HISTORICAL_PREFIX = 'hist_closes_'

export const getHistoricalCloses = async (
  symbol: string,
): Promise<number[]> => {
  const CACHE_KEY = `${HISTORICAL_PREFIX}${symbol}`

  try {
    const cachedCloses = await getCache<number[]>(CACHE_KEY)
    if (cachedCloses) {
      return cachedCloses
    }

    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - 180 * 24 * 60 * 60 * 1000)

    const result = await yahoo.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    })

    if (!result || !result.quotes || result.quotes.length === 0) {
      throw new Error('No data returned')
    }

    const closes = result.quotes
      .filter((quote) => quote.close !== null && quote.close !== undefined)
      .map((quote) => quote.close as number)

    await setCache(
      CACHE_KEY,
      closes,
      CACHE_TTL.DECISION_SUPPORT.HISTORICAL_CLOSES,
    )
    return closes
  } catch (error) {
    logger.error(`Internal Yahoo Finance Error for ${symbol}`, error)
    throw new Error('Could not fetch time series data from Yahoo Finance')
  }
}

export const getAnalystRatings = async (symbol: string) => {
  const { data } = await finnhubClient.get('/stock/recommendation', {
    params: { symbol: symbol },
  })
  return data
}

export const getNews = async (symbol: string) => {
  const currentMonth = getPakistanMonth()
  const earningsMonths = [0, 3, 6, 9]
  const isEarningsSeason = earningsMonths.includes(currentMonth)

  try {
    const params = {
      ticker: symbol.toUpperCase(),
      limit: 50,
      order: 'desc',
      sort: 'published_utc',
    }

    const { data } = await polygonClient.get('/v2/reference/news', { params })

    if (!data.results) return []

    return data.results.map((article: any) => {
      const insight = article.insights?.find(
        (i: any) => i.ticker === symbol.toUpperCase(),
      )
      const { sentiment, sentimentScore } = mapPolygonSentiment(
        insight?.sentiment,
      )

      return {
        title: article.title,
        url: article.article_url,
        time_published: article.published_utc,
        summary: article.description || '',
        banner_image: article.image_url,
        source: article.publisher?.name || 'Polygon',
        overall_sentiment_label: sentiment || 'NEUTRAL',
        overall_sentiment_score: sentimentScore ?? 0,
        ticker_sentiment: insight
          ? [
              {
                ticker: symbol.toUpperCase(),
                ticker_sentiment_score: sentimentScore?.toString() ?? '0',
                relevance_score: '1.0',
              },
            ]
          : [],
        isEarningsContext:
          isEarningsSeason &&
          mapPolygonCategory(article.keywords || [], article.title) ===
            'EARNINGS',
      }
    })
  } catch (error) {
    logger.error('Polygon News Fetch Error', error)
    return []
  }
}

export const computeRSI = (closes: number[]) => {
  const values = RSI.calculate({ values: closes, period: 14 })
  return values[values.length - 1] ?? 50
}

export const computeTrend = (closes: number[]) => {
  const short = average(closes.slice(-5))
  const long = average(closes.slice(-20))
  if (short > long) return 'UP'
  if (short < long) return 'DOWN'
  return 'FLAT'
}

const average = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length

export const parseAnalystConsensus = (data: any[]) => {
  if (!data || data.length === 0) {
    return { rating: 'HOLD', confidencePercent: 0, sourceCount: 0 }
  }

  const r = data[0]
  const totalAnalysts = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell
  const bullishCount = r.strongBuy + r.buy
  const confidencePercent =
    totalAnalysts > 0 ? Math.round((bullishCount / totalAnalysts) * 100) : 0

  let rating = 'HOLD'
  if (confidencePercent >= 80) rating = 'STRONG_BUY'
  else if (confidencePercent >= 60) rating = 'BUY'
  else if (confidencePercent >= 40) rating = 'HOLD'
  else if (confidencePercent >= 20) rating = 'SELL'
  else rating = 'STRONG_SELL'

  return {
    rating,
    confidencePercent,
    sourceCount: totalAnalysts,
  }
}

export const computeSentiment = (feed: any[], targetTicker: string) => {
  const volume = feed.length

  if (!volume) {
    return { score: 0, trend: 'FLAT', change48hPercent: 0, newsVolume: 0 }
  }

  const tickerScores = feed.map((article) => {
    const tickerData = article.ticker_sentiment?.find(
      (t: any) => t.ticker === targetTicker,
    )

    if (tickerData) {
      return (
        parseFloat(tickerData.ticker_sentiment_score || '0') *
        parseFloat(tickerData.relevance_score || '0')
      )
    }

    return (article.overall_sentiment_score ?? 0) * 0.1
  })

  const avgScore = tickerScores.reduce((a, b) => a + b, 0) / volume

  let trend: 'UP' | 'DOWN' | 'FLAT' = 'FLAT'
  if (avgScore >= 0.15) trend = 'UP'
  else if (avgScore <= -0.15) trend = 'DOWN'

  const midPoint = Math.floor(volume / 2)
  const recentScore =
    tickerScores.slice(0, midPoint).reduce((a, b) => a + b, 0) / midPoint
  const olderScore =
    tickerScores.slice(midPoint).reduce((a, b) => a + b, 0) /
    (volume - midPoint)

  const change48h =
    olderScore !== 0
      ? ((recentScore - olderScore) / Math.abs(olderScore)) * 100
      : 0

  return {
    score: Number(avgScore.toFixed(4)),
    trend,
    change48hPercent: Number(change48h.toFixed(2)),
    newsVolume: volume,
  }
}

const computeTechnicalConfidence = (rsi: number) => {
  const distanceFromNeutral = Math.abs(rsi - 50)
  return Math.min(distanceFromNeutral / 50, 1)
}

const computeSentimentConfidence = (score: number, newsVolume: number) => {
  const magnitudeScore = Math.min(Math.abs(score), 1)
  const volumeFactor = Math.min(newsVolume / 50, 1)
  return magnitudeScore * volumeFactor
}

const computeAnalystConfidence = (
  confidencePercent: number,
  sourceCount: number,
) => {
  const consensusStrength = confidencePercent / 100
  const breadthFactor = Math.min(sourceCount / 25, 1)
  return consensusStrength * breadthFactor
}

const computeDataConfidence = (newsVolume: number, analystCount: number) => {
  let score = 0
  if (newsVolume >= 10) score += 0.5
  if (analystCount >= 10) score += 0.5
  return score
}

export const computeDecision = ({
  rsi,
  sentimentTrend,
  analystRating,
  sentimentScore,
  newsVolume,
  analystConfidencePercent,
  analystSourceCount,
}: any) => {
  const riskFlags: string[] = []

  if (rsi >= 70) riskFlags.push('OVERBOUGHT_CONDITION')
  else if (rsi <= 30) riskFlags.push('OVERSOLD_OPPORTUNITY')

  if (analystRating === 'STRONG_BUY' && sentimentTrend === 'DOWN')
    riskFlags.push('SENTIMENT_DIVERGENCE_WARNING')

  if (analystRating === 'SELL' && sentimentTrend === 'UP')
    riskFlags.push('CONTRA_RECOVERY_DETECTED')

  if (riskFlags.length === 0) {
    if (rsi > 40 && rsi < 60 && sentimentTrend === 'UP')
      riskFlags.push('STABLE_UPTREND')
    else riskFlags.push('NEUTRAL_MARKET_CONDITIONS')
  }

  let recommendation = 'HOLD / CAUTION'
  if (
    rsi < 65 &&
    sentimentTrend === 'UP' &&
    (analystRating === 'BUY' || analystRating === 'STRONG_BUY')
  ) {
    recommendation = 'BUY'
  } else if (rsi >= 75 || (rsi > 60 && sentimentTrend === 'DOWN')) {
    recommendation = 'SELL'
  }

  const technicalConfidence = computeTechnicalConfidence(rsi)
  const sentimentConfidence = computeSentimentConfidence(
    sentimentScore,
    newsVolume,
  )
  const analystConfidence = computeAnalystConfidence(
    analystConfidencePercent,
    analystSourceCount,
  )
  const dataConfidence = computeDataConfidence(newsVolume, analystSourceCount)

  const confidence =
    technicalConfidence * 0.35 +
    sentimentConfidence * 0.35 +
    analystConfidence * 0.2 +
    dataConfidence * 0.1

  let timeHorizon = 'SHORT_TERM (1-5 days)'
  if (rsi >= 65 || rsi <= 35 || sentimentTrend !== 'FLAT') {
    timeHorizon = 'SHORT_TERM (1-5 days)'
  }
  if (analystConfidencePercent >= 70) {
    timeHorizon = 'MEDIUM_TERM (1-4 weeks)'
  }

  return {
    recommendation,
    timeHorizon,
    confidence: Number(confidence.toFixed(2)),
    riskFlags,
  }
}

export const generateReasoning = ({
  rsi,
  sentimentTrend,
  sentimentChange48h,
  analystRating,
}: any) => {
  const details: string[] = []

  if (analystRating === 'STRONG_BUY' || analystRating === 'BUY') {
    details.push(
      `Analyst consensus remains ${analystRating.replace('_', ' ').toLowerCase()}`,
    )
  }

  if (sentimentTrend === 'DOWN') {
    details.push('Market sentiment has weakened in the last 48 hours')
  } else if (sentimentTrend === 'UP') {
    details.push('Market sentiment is improving')
  }

  if (rsi >= 70) {
    details.push('RSI indicates overbought conditions')
  } else if (rsi <= 30) {
    details.push('RSI indicates oversold conditions')
  }

  const summary =
    details.length >= 2
      ? `Multiple indicators suggest elevated short-term risk`
      : `Indicators remain mixed with no strong directional bias`

  return { summary, details }
}

export const computeActionGuidance = (
  recommendation: string,
  rsi: number,
  sentimentTrend: string,
) => {
  if (recommendation === 'BUY') {
    return {
      buyWindow:
        rsi < 60 ? 'Next 1-3 days on pullbacks' : 'Wait for RSI cooling',
      holdWindow: null,
      sellWindow: null,
      watchFor: 'Continuation with volume support',
    }
  }

  if (recommendation === 'SELL') {
    return {
      buyWindow: null,
      holdWindow: null,
      sellWindow: 'Into strength or momentum loss',
      watchFor: 'RSI reversal or sentiment stabilization',
    }
  }

  return {
    buyWindow: null,
    holdWindow: '1-5 days',
    sellWindow: null,
    watchFor:
      sentimentTrend === 'DOWN'
        ? 'Further sentiment deterioration'
        : 'RSI normalization below 65',
  }
}

// ── Portfolio Decision Functions ──
export async function getPortfolioSnapshot(portfolioId: string) {
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
    include: {
      positions: true,
    },
  })

  if (!portfolio) {
    throw new Error('Portfolio not found')
  }

  const symbols = portfolio.positions.map((p) => p.symbol)

  const [livePrices, sectorMap] = await Promise.all([
    getLivePrices(symbols),
    getCompanySectors(symbols),
  ])

  const positionsWithLive = portfolio.positions.map((position) => {
    const currentPrice = livePrices[position.symbol] ?? 0
    const sector = sectorMap[position.symbol] ?? 'Unknown'

    return {
      symbol: position.symbol,
      quantity: position.quantity,
      avg_entry_price: position.avgEntryPrice,
      currentPrice,
      currentValue: position.quantity * currentPrice,
      unrealizedPnL:
        (currentPrice - position.avgEntryPrice) * position.quantity,
      unrealizedPnLPercent:
        position.avgEntryPrice > 0
          ? ((currentPrice - position.avgEntryPrice) / position.avgEntryPrice) *
            100
          : 0,
      sector,
    }
  })

  const totalMarketValue = positionsWithLive.reduce(
    (sum, p) => sum + p.currentValue,
    0,
  )

  const totalCost = portfolio.positions.reduce(
    (sum, p) => sum + p.quantity * p.avgEntryPrice,
    0,
  )

  const totalUnrealizedPnL = totalMarketValue - totalCost

  return {
    portfolioId: portfolio.id,
    summary: {
      totalPositions: positionsWithLive.length,
      totalMarketValue: Number(totalMarketValue.toFixed(2)),
      totalUnrealizedPnL: Number(totalUnrealizedPnL.toFixed(2)),
      totalUnrealizedPnLPercent:
        totalCost > 0
          ? Number(((totalUnrealizedPnL / totalCost) * 100).toFixed(2))
          : 0,
    },
    positions: positionsWithLive,
  }
}

export async function getLatestPortfolioForUser(userId: string) {
  const latestPortfolio = await prisma.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  if (!latestPortfolio) return null

  return getPortfolioSnapshot(latestPortfolio.id)
}

export const uploadPortfolio = async (
  fileType: string | undefined,
  buffer: Buffer | undefined,
  userId: string,
) => {
  if (!fileType || !buffer) throw new ValidationError('File is required')

  let rows: RawPortfolioRow[] = []

  if (fileType.includes('csv')) {
    rows = parse(buffer.toString(), {
      columns: true,
      skip_empty_lines: true,
    })
  } else {
    const workbook = xlsx.read(buffer)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    rows = xlsx.utils.sheet_to_json(sheet)
  }

  const validatedData = validateOrThrow(PortfolioArrayValidator, rows)
  const { positions, summary } = await enrichPortfolio(validatedData)

  const portfolio = await prisma.portfolio.create({
    data: {
      userId: userId,
    },
  })

  await prisma.position.createMany({
    data: positions.map((pos) => ({
      portfolioId: portfolio.id,
      symbol: pos.symbol,
      quantity: pos.quantity,
      avgEntryPrice: pos.avg_entry_price,
      sector: pos.sector,
    })),
  })

  return {
    portfolioId: portfolio.id,
    uploadedAt: new Date().toISOString(),
    summary,
    positions,
  }
}

export const getPortfolioDecisionResponse = async (
  userId: string,
  portfolioId: string,
  decisionMode: 'OVERVIEW' | 'DETAILED',
) => {
  const fullResults = await generateBatchDecision(portfolioId)

  persistDecisionRun(userId, portfolioId, fullResults).catch((err) =>
    logger.error('[DecisionPersist] Failed to persist run', err),
  )

  const positions =
    decisionMode === 'OVERVIEW'
      ? fullResults.map((result) => ({
          symbol: result.symbol,
          sector: result.sector,
          marketDecision: result.marketDecision,
          portfolioDecision: result.portfolioDecision,
          confidence: result.confidence,
          riskLevel: result.riskLevel,
        }))
      : fullResults

  return { decisionMode, portfolioId, positions }
}

export const calculateExposure = (
  position: PortfolioPosition,
  portfolioValue: number,
  allPositions: PortfolioPosition[],
) => {
  const positionValue = position.quantity * position.currentPrice

  const positionPercent = (positionValue / portfolioValue) * 100

  const sectorValue = allPositions
    .filter((p) => p.sector === position.sector)
    .reduce((sum, p) => sum + p.quantity * p.currentPrice, 0)

  const sectorPercent = (sectorValue / portfolioValue) * 100

  return {
    positionPercentOfPortfolio: Number(positionPercent.toFixed(2)),
    sectorExposurePercent: Number(sectorPercent.toFixed(2)),
    isOverExposed: positionPercent > 15 || sectorPercent > 40,
  }
}

export const assessRisk = (exposure: {
  isOverExposed: boolean
}): {
  riskLevel: RiskLevel
  volatilityLevel: VolatilityLevel
  contributors: string[]
} => {
  if (exposure.isOverExposed) {
    return {
      riskLevel: 'HIGH',
      volatilityLevel: 'ELEVATED',
      contributors: ['OVEREXPOSED_POSITION', 'SECTOR_CONCENTRATION'],
    }
  }

  return {
    riskLevel: 'MEDIUM',
    volatilityLevel: 'NORMAL',
    contributors: [],
  }
}

export const calculateFinalConfidence = (opts: {
  positionPercent: number
  sectorPercent: number
  isOverExposed: boolean
  unrealizedPnLPercent: number
  totalPositions: number
}): number => {
  let score = 0.88

  if (opts.positionPercent > 30) score -= 0.15
  else if (opts.positionPercent > 15) score -= 0.08
  else if (opts.positionPercent < 10) score += 0.03

  if (opts.sectorPercent > 60) score -= 0.12
  else if (opts.sectorPercent > 40) score -= 0.06

  if (opts.unrealizedPnLPercent > 20) score += 0.05
  else if (opts.unrealizedPnLPercent > 5) score += 0.02
  else if (opts.unrealizedPnLPercent < -20) score -= 0.1
  else if (opts.unrealizedPnLPercent < -5) score -= 0.04

  if (opts.totalPositions >= 8) score += 0.03
  else if (opts.totalPositions <= 2) score -= 0.05

  return Number(Math.max(0.3, Math.min(0.98, score)).toFixed(2))
}

const getActionGuidance = (
  currentPrice: number,
  riskLevel: string,
  confidence: number,
): ActionGuidance => {
  const isHighRisk = riskLevel === 'HIGH'
  const holdDuration = isHighRisk
    ? confidence < 0.6
      ? '1–3 days'
      : '2–10 days'
    : confidence >= 0.8
      ? '5–20 days'
      : '3–14 days'
  return {
    positionStrategy: {
      add: !isHighRisk,
      hold: true,
      trim: isHighRisk,
      exit: false,
    },
    holdDuration,
    takeProfitZone: (currentPrice * 1.1).toFixed(2),
    stopLossZone: (currentPrice * 0.95).toFixed(2),
    watchFor: ['Volume spikes', 'RSI divergence', 'Sector momentum'],
  }
}

export const generateBatchDecision = async (
  portfolioId: string,
): Promise<DecisionResult[]> => {
  const snapshot = await getPortfolioSnapshot(portfolioId)

  const marketDataPromises = snapshot.positions.map((p) =>
    getUnifiedMarketDecision(p.symbol),
  )
  const realMarketDecisions = await Promise.all(marketDataPromises)
  return snapshot.positions.map((position, index) => {
    const exposure = calculateExposure(
      position as any,
      snapshot.summary.totalMarketValue,
      snapshot.positions as any,
    )

    const risk = assessRisk(exposure)
    const pnlPct = position.unrealizedPnLPercent
    const actualMarketData = realMarketDecisions[index]
    const marketDecision = actualMarketData.decision.recommendation

    let portfolioDecision: string
    if (pnlPct < -20 || (marketDecision === 'SELL' && exposure.isOverExposed)) {
      portfolioDecision = 'EXIT'
    } else if (
      pnlPct < -5 ||
      (exposure.isOverExposed && exposure.positionPercentOfPortfolio > 25)
    ) {
      portfolioDecision = 'TRIM'
    } else if (exposure.isOverExposed || marketDecision === 'SELL') {
      portfolioDecision = 'HOLD'
    } else if (
      marketDecision === 'BUY' &&
      exposure.positionPercentOfPortfolio < 20
    ) {
      portfolioDecision = 'ADD'
    } else {
      portfolioDecision = 'HOLD'
    }

    const details: string[] = []
    if (exposure.positionPercentOfPortfolio > 30)
      details.push('Heavily concentrated position')
    else if (exposure.positionPercentOfPortfolio > 15)
      details.push('Concentrated position size')
    if (exposure.sectorExposurePercent > 60)
      details.push('Critical sector over-exposure')
    else if (exposure.sectorExposurePercent > 40)
      details.push('High sector concentration')
    if (pnlPct < -20) details.push('Significant unrealized loss')
    else if (pnlPct < 0) details.push('Position currently underperforming')
    if (pnlPct > 25) details.push('Strong gains — consider profit-taking')
    if (exposure.positionPercentOfPortfolio < 5)
      details.push('Small position — low portfolio impact')

    let reasoningSummary: string
    if (portfolioDecision === 'EXIT') {
      reasoningSummary =
        'Critical risk detected — position should be closed to protect portfolio health.'
    } else if (portfolioDecision === 'TRIM') {
      reasoningSummary =
        'Risk metrics indicate reducing this position size to improve portfolio balance.'
    } else if (portfolioDecision === 'ADD') {
      reasoningSummary =
        'Technicals and portfolio allocation support increasing exposure to this position.'
    } else if (exposure.isOverExposed) {
      reasoningSummary =
        'Market is favorable, but internal portfolio risk requires holding without adding.'
    } else {
      reasoningSummary =
        'Technicals and portfolio health are aligned — maintain current position.'
    }

    const confidence = calculateFinalConfidence({
      positionPercent: exposure.positionPercentOfPortfolio,
      sectorPercent: exposure.sectorExposurePercent,
      isOverExposed: exposure.isOverExposed,
      unrealizedPnLPercent: pnlPct,
      totalPositions: snapshot.positions.length,
    })

    return {
      symbol: position.symbol,
      sector: position.sector,
      marketDecision,
      portfolioDecision,
      confidence,
      riskLevel: risk.riskLevel,
      reasoning: {
        summary: reasoningSummary,
        details,
      },
      exposure: {
        positionPercent: exposure.positionPercentOfPortfolio,
        sectorPercent: exposure.sectorExposurePercent,
        isOverExposed: exposure.isOverExposed,
      },
      actionGuidance: getActionGuidance(
        position.currentPrice,
        risk.riskLevel,
        confidence,
      ),
    }
  })
}
