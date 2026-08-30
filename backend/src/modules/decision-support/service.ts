import { parse } from 'csv-parse/sync'
import { RSI } from 'technicalindicators'
import * as xlsx from 'xlsx'
import { validateOrThrow, ValidationError } from '../../shared/errors'
import { getCache, setCache } from '../../shared/infrastructure/cache'
import { CACHE_TTL } from '../../shared/constants'
import finnhubClient from '../../shared/infrastructure/clients/finnhub-client'
import polygonClient from '../../shared/infrastructure/clients/polygon-client'
import yahoo from '../../shared/infrastructure/clients/yahoo-finance-client'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import { getPakistanMonth } from '../../shared/utils'
import { getCompanySectors, getLivePrices, StockQuote } from '../market'
import { mapPolygonCategory, mapPolygonSentiment } from '../news'
import { persistDecisionRun } from './repository'
import fmpClient from '../../shared/infrastructure/clients/fmp-client'
import twelveDataClient from '../../shared/infrastructure/clients/twelve-data-client'
import {
    ActionGuidance,
    DecisionResult,
    EnrichedPortfolioPosition,
    PortfolioPosition,
    PortfolioRiskMetrics,
    PortfolioSummary,
    PositionSizeResult,
    PriceTargets,
    RadarCard,
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

  await setCache(CACHE_KEY, finalData, CACHE_TTL.DECISION_SUPPORT.TRADE_DECISION)
  return finalData
}

export const getMarketDecisionResponse = async (symbol: string) => {
  const [marketData, atr] = await Promise.all([
    getUnifiedMarketDecision(symbol),
    getATR(symbol),
  ])
  const reasoning = generateReasoning({
    rsi: marketData.rsi,
    sentimentTrend: marketData.sentiment.trend,
    sentimentChange48h: marketData.sentiment.change48hPercent,
    analystRating: marketData.analyst.rating,
  })

  const currentPrice = marketData.quote?.c || marketData.quote?.pc || 0
  const priceTargets = computePriceTargets(currentPrice, atr)

  return {
    symbol,
    timestamp: new Date().toISOString(),
    marketContext: {
      marketStatus: marketData.marketStatus,
      lastClosePrice: marketData.quote.pc,
    },
    analystConsensus: marketData.analyst,
    priceState: {
      current: currentPrice,
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
    atr,
    priceTargets,
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

    if (!result?.quotes?.length) {
      throw new Error('No data returned')
    }

    const closes = result.quotes
      .filter((quote) => quote.close !== null && quote.close !== undefined)
      .map((quote) => quote.close as number)

    await setCache(CACHE_KEY, closes, CACHE_TTL.DECISION_SUPPORT.HISTORICAL_CLOSES)
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
  return values.at(-1) ?? 50
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

  let rating: string
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
        Number.parseFloat(tickerData.ticker_sentiment_score || '0') *
        Number.parseFloat(tickerData.relevance_score || '0')
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

const determineRiskFlags = (
  rsi: number,
  analystRating: string,
  sentimentTrend: string,
): string[] => {
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
  return riskFlags
}

const determineRecommendation = (
  rsi: number,
  sentimentTrend: string,
  analystRating: string,
): string => {
  if (
    rsi < 65 &&
    sentimentTrend === 'UP' &&
    (analystRating === 'BUY' || analystRating === 'STRONG_BUY')
  ) {
    return 'BUY'
  }
  if (rsi >= 75 || (rsi > 60 && sentimentTrend === 'DOWN')) {
    return 'SELL'
  }
  return 'HOLD / CAUTION'
}

const determineTimeHorizon = (analystConfidencePercent: number): string => {
  if (analystConfidencePercent >= 70) {
    return 'MEDIUM_TERM (1-4 weeks)'
  }
  return 'SHORT_TERM (1-5 days)'
}

export const computeDecision = ({
  rsi,
  sentimentScore,
  sentimentTrend,
  analystRating,
  newsVolume,
  analystConfidencePercent,
  analystSourceCount,
}: any) => {
  const riskFlags = determineRiskFlags(rsi, analystRating, sentimentTrend)
  const recommendation = determineRecommendation(
    rsi,
    sentimentTrend,
    analystRating,
  )
  const timeHorizon = determineTimeHorizon(analystConfidencePercent)

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

const getHoldDuration = (isHighRisk: boolean, confidence: number): string => {
  if (isHighRisk) {
    return confidence < 0.6 ? '1–3 days' : '2–10 days'
  }
  return confidence >= 0.8 ? '5–20 days' : '3–14 days'
}

const getActionGuidance = (
  currentPrice: number,
  riskLevel: string,
  confidence: number,
): ActionGuidance => {
  const isHighRisk = riskLevel === 'HIGH'
  const holdDuration = getHoldDuration(isHighRisk, confidence)
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

const determinePortfolioDecision = (
  pnlPct: number,
  marketDecision: string,
  exposure: ReturnType<typeof calculateExposure>,
): string => {
  if (pnlPct < -20 || (marketDecision === 'SELL' && exposure.isOverExposed)) {
    return 'EXIT'
  }
  if (
    pnlPct < -5 ||
    (exposure.isOverExposed && exposure.positionPercentOfPortfolio > 25)
  ) {
    return 'TRIM'
  }
  if (exposure.isOverExposed || marketDecision === 'SELL') {
    return 'HOLD'
  }
  if (marketDecision === 'BUY' && exposure.positionPercentOfPortfolio < 20) {
    return 'ADD'
  }
  return 'HOLD'
}

const generateDecisionDetails = (
  exposure: ReturnType<typeof calculateExposure>,
  pnlPct: number,
): string[] => {
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
  return details
}

const generateReasoningSummary = (
  portfolioDecision: string,
  isOverExposed: boolean,
): string => {
  if (portfolioDecision === 'EXIT') {
    return 'Critical risk detected — position should be closed to protect portfolio health.'
  }
  if (portfolioDecision === 'TRIM') {
    return 'Risk metrics indicate reducing this position size to improve portfolio balance.'
  }
  if (portfolioDecision === 'ADD') {
    return 'Technicals and portfolio allocation support increasing exposure to this position.'
  }
  if (isOverExposed) {
    return 'Market is favorable, but internal portfolio risk requires holding without adding.'
  }
  return 'Technicals and portfolio health are aligned — maintain current position.'
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
    const portfolioDecision = determinePortfolioDecision(
      pnlPct,
      marketDecision,
      exposure,
    )
    const details = generateDecisionDetails(exposure, pnlPct)
    const reasoningSummary = generateReasoningSummary(
      portfolioDecision,
      exposure.isOverExposed,
    )

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

// ── Opportunity Radar & Price Targets (Persona A) ──

export const SPUS_TOP_50_STOCKS: { symbol: string; sector: string }[] = [
  { symbol: 'MSFT', sector: 'Technology' },
  { symbol: 'AAPL', sector: 'Technology' },
  { symbol: 'NVDA', sector: 'Technology' },
  { symbol: 'GOOGL', sector: 'Communication Services' },
  { symbol: 'AMZN', sector: 'Consumer Cyclical' },
  { symbol: 'META', sector: 'Communication Services' },
  { symbol: 'TSLA', sector: 'Consumer Cyclical' },
  { symbol: 'LLY', sector: 'Healthcare' },
  { symbol: 'AVGO', sector: 'Technology' },
  { symbol: 'CRM', sector: 'Technology' },
  { symbol: 'ADBE', sector: 'Technology' },
  { symbol: 'AMD', sector: 'Technology' },
  { symbol: 'QCOM', sector: 'Technology' },
  { symbol: 'TXN', sector: 'Technology' },
  { symbol: 'INTC', sector: 'Technology' },
  { symbol: 'AMAT', sector: 'Technology' },
  { symbol: 'PANW', sector: 'Technology' },
  { symbol: 'NOW', sector: 'Technology' },
  { symbol: 'INTU', sector: 'Technology' },
  { symbol: 'ISRG', sector: 'Healthcare' },
  { symbol: 'AMGN', sector: 'Healthcare' },
  { symbol: 'GILD', sector: 'Healthcare' },
  { symbol: 'VRTX', sector: 'Healthcare' },
  { symbol: 'REGN', sector: 'Healthcare' },
  { symbol: 'MDT', sector: 'Healthcare' },
  { symbol: 'SYK', sector: 'Healthcare' },
  { symbol: 'BDX', sector: 'Healthcare' },
  { symbol: 'EW', sector: 'Healthcare' },
  { symbol: 'IDXX', sector: 'Healthcare' },
  { symbol: 'ZTS', sector: 'Healthcare' },
  { symbol: 'DXCM', sector: 'Healthcare' },
  { symbol: 'BSX', sector: 'Healthcare' },
  { symbol: 'KLAC', sector: 'Technology' },
  { symbol: 'SNPS', sector: 'Technology' },
  { symbol: 'CDNS', sector: 'Technology' },
  { symbol: 'MRVL', sector: 'Technology' },
  { symbol: 'NXPI', sector: 'Technology' },
  { symbol: 'MCHP', sector: 'Technology' },
  { symbol: 'FTNT', sector: 'Technology' },
  { symbol: 'ADI', sector: 'Technology' },
  { symbol: 'ANSS', sector: 'Technology' },
  { symbol: 'ASML', sector: 'Technology' },
  { symbol: 'LRCX', sector: 'Technology' },
  { symbol: 'WDAY', sector: 'Technology' },
  { symbol: 'CRWD', sector: 'Technology' },
  { symbol: 'TEAM', sector: 'Technology' },
  { symbol: 'DDOG', sector: 'Technology' },
  { symbol: 'ZS', sector: 'Technology' },
  { symbol: 'NET', sector: 'Technology' },
  { symbol: 'HUBS', sector: 'Technology' },
]

export const computePriceTargets = (
  currentPrice: number,
  atr: number,
): PriceTargets => {
  const safePrice = currentPrice > 0 ? currentPrice : 100
  const effectiveAtr = atr > 0 ? atr : safePrice * 0.02

  const entryLow = Number(Math.max(0.01, safePrice - 0.5 * effectiveAtr).toFixed(2))
  const entryHigh = Number((safePrice + 0.25 * effectiveAtr).toFixed(2))
  const bullTarget = Number((safePrice + 2 * effectiveAtr).toFixed(2))
  const stopLoss = Number(Math.max(0.01, safePrice - 1.5 * effectiveAtr).toFixed(2))

  return {
    entryLow,
    entryHigh,
    bullTarget,
    stopLoss,
  }
}

const estimateAtrFromCloses = async (
  symbol: string,
): Promise<number | null> => {
  try {
    const closes = await getHistoricalCloses(symbol)
    if (closes && closes.length >= 14) {
      const recent = closes.slice(-14)
      const diffs = []
      for (let i = 1; i < recent.length; i++) {
        diffs.push(Math.abs(recent[i] - recent[i - 1]))
      }
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length
      return Number(
        (avgDiff || ((closes.at(-1) ?? 0) * 0.02)).toFixed(2),
      )
    }
  } catch (historyErr) {
    logger.error(`[getATR] Fallback closes failed for ${symbol}`, historyErr)
  }
  return null
}

export const getATR = async (symbol: string): Promise<number> => {
  const CACHE_KEY = `atr_v1:${symbol.toUpperCase()}`
  const cached = await getCache<number>(CACHE_KEY)
  if (cached !== null && cached !== undefined) return cached

  try {
    const { data } = await twelveDataClient.get('/atr', {
      params: {
        symbol: symbol.toUpperCase(),
        interval: '1day',
        time_period: 14,
      },
    })

    if (data?.values?.length) {
      const val = Number.parseFloat(data.values[0].atr)
      if (!Number.isNaN(val) && val > 0) {
        const roundedAtr = Number(val.toFixed(2))
        await setCache(CACHE_KEY, roundedAtr, CACHE_TTL.DECISION_SUPPORT.ATR)
        return roundedAtr
      }
    }
    throw new Error(`Twelve data ATR empty for ${symbol}`)
  } catch (err) {
    logger.error(
      `[getATR] Twelve Data ATR failed for ${symbol}, estimating from closes`,
      err,
    )
    const fallbackAtr = await estimateAtrFromCloses(symbol)
    if (fallbackAtr !== null) {
      await setCache(CACHE_KEY, fallbackAtr, CACHE_TTL.DECISION_SUPPORT.ATR)
      return fallbackAtr
    }
    return 2.5
  }
}

export const calculatePositionSize = (opts: {
  capital: number
  currentPrice: number
  stopLoss: number
  bullTarget: number
}): PositionSizeResult => {
  const { capital, currentPrice, stopLoss, bullTarget } = opts
  if (capital <= 0 || currentPrice <= 0) {
    return {
      shares: 0,
      riskPerShare: 0,
      totalRisk: 0,
      potentialGain: 0,
      riskRewardRatio: 0,
      percentOfCapital: 0,
    }
  }

  const shares = Math.floor(capital / currentPrice)
  const riskPerShare = Number(Math.max(0, currentPrice - stopLoss).toFixed(2))
  const totalRisk = Number((shares * riskPerShare).toFixed(2))
  const potentialGain = Number((shares * Math.max(0, bullTarget - currentPrice)).toFixed(2))
  const riskRewardRatio = totalRisk > 0 ? Number((potentialGain / totalRisk).toFixed(2)) : 0
  const percentOfCapital = Number(((shares * currentPrice) / capital * 100).toFixed(2))

  return {
    shares,
    riskPerShare,
    totalRisk,
    potentialGain,
    riskRewardRatio,
    percentOfCapital,
  }
}

export const getOpportunityRadar = async (
  timeline: '1D' | '1W' = '1D',
): Promise<RadarCard[]> => {
  const CACHE_KEY = `opportunity_radar_v2:${timeline}`
  const cached = await getCache<RadarCard[]>(CACHE_KEY)
  if (cached) return cached

  let candidates: { symbol: string; sector?: string }[] = []

  try {
    const { data } = await fmpClient.get('/company-screener', {
      params: {
        limit: 100,
        isEtf: false,
        isActivelyTrading: true,
        marketCapMoreThan: 10000000000,
      },
    })
    if (Array.isArray(data) && data.length > 0) {
      const spusSymbolSet = new Set(SPUS_TOP_50_STOCKS.map((s) => s.symbol))
      const filtered = data
        .filter(
          (item: any) =>
            item.symbol &&
            (spusSymbolSet.has(item.symbol) || (item.marketCap && item.marketCap > 20000000000)),
        )
        .slice(0, 30)
        .map((item: any) => ({
          symbol: item.symbol,
          sector: item.sector,
        }))

      if (filtered.length >= 10) {
        candidates = filtered
      }
    }
  } catch (err: any) {
    logger.warn(
      `[getOpportunityRadar] FMP screener call failed, falling back to static SPUS universe: ${err?.message || err}`,
    )
  }

  if (candidates.length === 0) {
    candidates = SPUS_TOP_50_STOCKS.slice(0, 25)
  }

  const topCandidates = candidates.slice(0, 20)

  const results: (RadarCard | null)[] = await Promise.all(
    topCandidates.map(async (cand) => {
      try {
        const symbol = cand.symbol.toUpperCase()
        const [marketData, atr] = await Promise.all([
          getUnifiedMarketDecision(symbol),
          getATR(symbol),
        ])

        const currentPrice = marketData.quote?.c || marketData.quote?.pc || 0
        const targets = computePriceTargets(currentPrice, atr)
        const confidence = marketData.decision.confidence
        let confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'
        if (confidence >= 0.7) {
          confidenceLabel = 'HIGH'
        } else if (confidence >= 0.4) {
          confidenceLabel = 'MEDIUM'
        }

        return {
          symbol,
          sector: cand.sector || 'Technology',
          currentPrice,
          atr,
          entryRange: { low: targets.entryLow, high: targets.entryHigh },
          bullTarget: targets.bullTarget,
          stopLoss: targets.stopLoss,
          confidence,
          confidenceLabel,
          recommendation: marketData.decision.recommendation,
          timeHorizon: marketData.decision.timeHorizon,
          riskFlags: marketData.decision.riskFlags,
        }
      } catch (e) {
        logger.error(`[getOpportunityRadar] Failed candidate ${cand.symbol}`, e)
        return null
      }
    }),
  )

  const validCards = results.filter((r): r is RadarCard => r !== null)
  validCards.sort((a, b) => b.confidence - a.confidence)

  await setCache(CACHE_KEY, validCards, CACHE_TTL.DECISION_SUPPORT.RADAR)
  return validCards
}

// ── Sharpe Ratio + Beta for Portfolio (Persona B) ──

export const computeAnnualizedReturn = (closes: number[]): number => {
  if (!closes || closes.length < 2 || closes[0] === 0) return 0
  const last = closes.at(-1) ?? closes[0]
  const first = closes[0]
  return Number(((last / first - 1) * (252 / closes.length)).toFixed(4))
}

export const computeAnnualizedVolatility = (closes: number[]): number => {
  if (!closes || closes.length < 2) return 0
  const logReturns: number[] = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      logReturns.push(Math.log(closes[i] / closes[i - 1]))
    }
  }
  if (logReturns.length === 0) return 0
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length
  const variance =
    logReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
    (logReturns.length - 1 || 1)
  const stdDev = Math.sqrt(variance)
  return Number((stdDev * Math.sqrt(252)).toFixed(4))
}

export const computeSharpeRatio = (
  closes: number[],
  riskFreeRate = 0.0525,
): number => {
  const annReturn = computeAnnualizedReturn(closes)
  const annVol = computeAnnualizedVolatility(closes)
  if (annVol === 0) return 0
  const sharpe = (annReturn - riskFreeRate) / annVol
  return Number(Math.max(-3, Math.min(3, sharpe)).toFixed(2))
}

export const fetchPortfolioBetas = async (
  symbols: string[],
): Promise<Record<string, number>> => {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))]
  if (unique.length === 0) return {}

  const sortedKey = [...unique].sort((a, b) => a.localeCompare(b)).join(',')
  const CACHE_KEY = `portfolio_betas:${sortedKey}`
  const cached = await getCache<Record<string, number>>(CACHE_KEY)
  if (cached) return cached

  const result: Record<string, number> = {}
  try {
    const { data } = await fmpClient.get('/company-screener', {
      params: {
        symbol: unique.join(','),
      },
    })
    if (Array.isArray(data)) {
      data.forEach((item: any) => {
        if (item.symbol && item.beta != null) {
          result[item.symbol.toUpperCase()] = Number(item.beta) || 1.0
        }
      })
    }
  } catch (err) {
    logger.error(
      '[fetchPortfolioBetas] FMP beta fetch failed, using fallback beta 1.0',
      err,
    )
  }

  unique.forEach((sym) => {
    result[sym] ??= 1.0
  })

  await setCache(CACHE_KEY, result, CACHE_TTL.DECISION_SUPPORT.PORTFOLIO_BETAS)
  return result
}

export const computePortfolioRiskMetrics = (
  positions: EnrichedPortfolioPosition[] | any[],
  livePrices: Record<string, number>,
  closesMap: Record<string, number[]>,
  betasMap: Record<string, number>,
): PortfolioRiskMetrics => {
  const totalValue = positions.reduce(
    (sum, p) => sum + (p.currentValue || (p.quantity * (livePrices[p.symbol] ?? p.currentPrice ?? 0)) || 0),
    0,
  )

  const perSymbol = positions.map((p) => {
    const symbol = p.symbol.toUpperCase()
    const beta = betasMap[symbol] ?? 1.0
    const closes = closesMap[symbol] ?? []
    const sharpe = computeSharpeRatio(closes)
    const volatilityAnnualized = computeAnnualizedVolatility(closes)

    return {
      symbol,
      beta,
      sharpe,
      volatilityAnnualized,
    }
  })

  let weightedBeta = 1.0
  let portfolioSharpe = 0.0

  if (totalValue > 0) {
    weightedBeta = positions.reduce((sum, p, i) => {
      const pVal = p.currentValue || (p.quantity * (livePrices[p.symbol] ?? p.currentPrice ?? 0)) || 0
      const weight = pVal / totalValue
      return sum + weight * perSymbol[i].beta
    }, 0)

    portfolioSharpe = positions.reduce((sum, p, i) => {
      const pVal = p.currentValue || (p.quantity * (livePrices[p.symbol] ?? p.currentPrice ?? 0)) || 0
      const weight = pVal / totalValue
      return sum + weight * perSymbol[i].sharpe
    }, 0)
  }

  // Sector concentration
  const sectorMap: Record<string, number> = {}
  positions.forEach((p) => {
    const sec = p.sector || 'Unknown'
    const pVal = p.currentValue || (p.quantity * (livePrices[p.symbol] ?? p.currentPrice ?? 0)) || 0
    sectorMap[sec] = (sectorMap[sec] || 0) + pVal
  })

  const sectorConcentration = Object.entries(sectorMap)
    .map(([sector, val]) => ({
      sector,
      weight: totalValue > 0 ? Number(((val / totalValue) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.weight - a.weight)

  return {
    weightedBeta: Number(weightedBeta.toFixed(2)),
    portfolioSharpe: Number(portfolioSharpe.toFixed(2)),
    perSymbol,
    sectorConcentration,
  }
}

export const getPortfolioRiskMetrics = async (
  portfolioId: string,
): Promise<PortfolioRiskMetrics> => {
  const snapshot = await getPortfolioSnapshot(portfolioId)
  const symbols = snapshot.positions.map((p) => p.symbol)

  const [betasMap, ...closesList] = await Promise.all([
    fetchPortfolioBetas(symbols),
    ...symbols.map((sym) =>
      getHistoricalCloses(sym).catch((err) => {
        logger.error(`Failed closes for ${sym} in risk metrics`, err)
        return [] as number[]
      }),
    ),
  ])

  const closesMap: Record<string, number[]> = {}
  symbols.forEach((sym, idx) => {
    closesMap[sym] = closesList[idx] || []
  })

  const livePricesMap: Record<string, number> = {}
  snapshot.positions.forEach((p) => {
    livePricesMap[p.symbol] = p.currentPrice
  })

  return computePortfolioRiskMetrics(
    snapshot.positions,
    livePricesMap,
    closesMap,
    betasMap,
  )
}

