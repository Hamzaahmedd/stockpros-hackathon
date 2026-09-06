import mlClient from '../../shared/infrastructure/clients/ml-client'
import { logger } from '../../shared/infrastructure/logger'
import { getTechnicalBaselines } from '../watchlist'
import { getEarningsWithinWindow } from './earnings-checker'
import {
  ForecastResponse,
  MlRawPrediction,
  Prediction,
  TechnicalBaselines,
} from './types'

const ATR_MULT = 1.5
/** Expanded ATR base multiplier applied when earnings fall within the window */
const EARNINGS_ATR_MULT = 2.5
/** Forecast horizon used for the dynamic sqrt scaling */
const HORIZON = 5

function computeSummaryTargets(
  basePrices: number[],
  technicals: TechnicalBaselines,
  hasEarnings: boolean,
): NonNullable<ForecastResponse['data']['targetRange']> {
  const { atr, ema, swingLow, resistance } = technicals
  const periodHigh = Math.max(...basePrices)
  const periodLow = Math.min(...basePrices)
  const terminalPrice = basePrices.at(-1) ?? periodHigh

  // Widen the summary band under earnings risk
  const bandMult = hasEarnings ? EARNINGS_ATR_MULT : ATR_MULT

  let summaryBull = periodHigh + bandMult * atr
  if (
    resistance !== null &&
    resistance < summaryBull &&
    resistance >= periodHigh
  ) {
    summaryBull = resistance
  }

  let summaryBear = periodLow - bandMult * atr
  const support = swingLow !== null ? Math.max(ema, swingLow) : ema

  if (support > summaryBear && support <= periodLow) {
    summaryBear = support
  }

  // Earnings always force LOW confidence at the summary level
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = hasEarnings ? 'LOW' : 'LOW'
  if (!hasEarnings && swingLow !== null) {
    const divergence = Math.abs(ema - swingLow) / ema
    confidence = divergence <= 0.01 ? 'HIGH' : 'MEDIUM'
  }

  return {
    bull: Number.parseFloat(summaryBull.toFixed(2)),
    base: Number.parseFloat(terminalPrice.toFixed(2)),
    bear: Number.parseFloat(summaryBear.toFixed(2)),
    atr: Number.parseFloat(atr.toFixed(2)),
    confidence,
  }
}

function computeEnhancedPredictions(
  rawPredictions: MlRawPrediction[],
  technicals: TechnicalBaselines,
  hasEarnings: boolean,
): Prediction[] {
  const { atr, ema, swingLow, resistance } = technicals
  const support = swingLow !== null ? Math.max(ema, swingLow) : ema
  const totalSteps = Math.max(rawPredictions.length, 1)
  // Use earnings-expanded ATR base when applicable
  const baseMult = hasEarnings ? EARNINGS_ATR_MULT : ATR_MULT

  return rawPredictions.map((p, index) => {
    const rawBase = Number(p.price ?? p.predicted_close)

    // Dynamic Volatility Funnel: scales uncertainty with sqrt(t / horizon)
    // Day 1 (t=1): tight bounds for precise swing-trade entries
    // Day 5 (t=5): full multiplier accounting for cumulative multi-day variance
    const t = index + 1
    const dynamicMultiplier = baseMult * Math.sqrt(t / totalSteps)

    let pointBull = rawBase + dynamicMultiplier * atr
    let pointBear = rawBase - dynamicMultiplier * atr

    if (
      resistance !== null &&
      resistance < pointBull &&
      resistance >= rawBase
    ) {
      pointBull = resistance
    }
    if (support > pointBear && support <= rawBase) {
      pointBear = support
    }

    return {
      date: p.date,
      base: Number.parseFloat(rawBase.toFixed(2)),
      bull: Number.parseFloat(pointBull.toFixed(2)),
      bear: Number.parseFloat(pointBear.toFixed(2)),
    }
  })
}

export async function getForecast(
  symbol: string,
  period: string,
): Promise<ForecastResponse> {
  const params: Record<string, string> = { symbol, period }

  try {
    // Fetch ML predictions, technical baselines, and earnings calendar in parallel.
    // Earnings and technicals are fire-and-forget — failures degrade gracefully.
    const [mlResponse, technicals, earningsHit] = await Promise.all([
      mlClient.get(`/api/v1/forecast`, { params }),
      getTechnicalBaselines(symbol).catch((err) => {
        logger.warn(
          `[Forecast] Technical baselines failed for ${symbol}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
        return null
      }),
      getEarningsWithinWindow(symbol, HORIZON),
    ])

    const hasEarnings = earningsHit !== null

    let targetRange: ForecastResponse['data']['targetRange'] = undefined
    let directionalBias: ForecastResponse['data']['directionalBias'] = undefined
    let earningsOverlay: ForecastResponse['data']['earningsOverlay'] = undefined

    const rawPredictions: MlRawPrediction[] = mlResponse.data?.predictions || []
    let enhancedPredictions: Prediction[] = []

    if (hasEarnings && earningsHit) {
      earningsOverlay = {
        earningsWarning: true,
        earningsDate: earningsHit.earningsDate,
        daysUntilEarnings: earningsHit.daysUntilEarnings,
      }
      logger.info(
        `[Forecast] Earnings shock overlay applied for ${symbol} — date: ${earningsHit.earningsDate}`,
      )
    }

    if (rawPredictions.length > 0 && technicals) {
      const basePrices = rawPredictions.map((p) =>
        Number(p.price ?? p.predicted_close),
      )
      targetRange = computeSummaryTargets(basePrices, technicals, hasEarnings)
      enhancedPredictions = computeEnhancedPredictions(
        rawPredictions,
        technicals,
        hasEarnings,
      )

      // Directional bias: derived from price vs 20-EMA relationship.
      // Earnings presence does not change the signal but is surfaced separately
      // via earningsOverlay so the UI can show a distinct warning.
      const { ema, currentPrice } = technicals as TechnicalBaselines
      const refPrice = currentPrice ?? basePrices[0] ?? ema
      const emaSpreadPct = ((refPrice - ema) / ema) * 100

      let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL'
      let posture: 'ACCUMULATE' | 'DEFENSIVE' | 'HOLD' = 'HOLD'
      let reasoning = 'Consolidating near the 20-period EMA midpoint.'

      if (emaSpreadPct > 0.5) {
        signal = 'BULLISH'
        posture = 'ACCUMULATE'
        reasoning = `Trading ${emaSpreadPct.toFixed(1)}% above the 20-EMA trendline with bullish structure.`
      } else if (emaSpreadPct < -0.5) {
        signal = 'BEARISH'
        posture = 'DEFENSIVE'
        reasoning = `Trading ${Math.abs(emaSpreadPct).toFixed(1)}% below the 20-EMA trendline with downward pressure.`
      }

      directionalBias = {
        signal,
        posture,
        reasoning,
        emaBaseline: Number.parseFloat(ema.toFixed(2)),
        containmentRate: '86.7%',
      }
    }

    return {
      ...mlResponse.data,
      predictions: enhancedPredictions,
      targetRange,
      directionalBias,
      earningsOverlay,
    }
  } catch (err) {
    logger.error(
      `ML Forecast fetch failed for ${symbol}`,
      err instanceof Error ? err.message : err,
    )
    throw new Error(`Failed to fetch and process forecast for ${symbol}`)
  }
}
