import mlClient from '../../shared/infrastructure/clients/ml-client'
import { logger } from '../../shared/infrastructure/logger'
import { getTechnicalBaselines } from '../watchlist'
import { ForecastResponse, MlRawPrediction, Prediction } from './types'

const ATR_MULT = 1.5

interface TechnicalBaselines {
  atr: number
  ema: number
  swingLow: number | null
  resistance: number | null
}

function computeSummaryTargets(
  basePrices: number[],
  technicals: TechnicalBaselines,
): NonNullable<ForecastResponse['data']['targetRange']> {
  const { atr, ema, swingLow, resistance } = technicals
  const periodHigh = Math.max(...basePrices)
  const periodLow = Math.min(...basePrices)
  const terminalPrice = basePrices.at(-1) ?? periodHigh

  let summaryBull = periodHigh + ATR_MULT * atr
  if (
    resistance !== null &&
    resistance < summaryBull &&
    resistance >= periodHigh
  ) {
    summaryBull = resistance
  }

  let summaryBear = periodLow - ATR_MULT * atr
  const support = swingLow !== null ? Math.max(ema, swingLow) : ema

  if (support > summaryBear && support <= periodLow) {
    summaryBear = support
  }

  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'
  if (swingLow !== null) {
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
): Prediction[] {
  const { atr, ema, swingLow, resistance } = technicals
  const support = swingLow !== null ? Math.max(ema, swingLow) : ema

  return rawPredictions.map((p) => {
    const rawBase = Number(p.price ?? p.predicted_close)

    let pointBull = rawBase + ATR_MULT * atr
    let pointBear = rawBase - ATR_MULT * atr

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
    const [mlResponse, technicals] = await Promise.all([
      mlClient.get(`/api/v1/forecast`, { params }),
      getTechnicalBaselines(symbol).catch((err) => {
        logger.warn(
          `[Forecast] Technical baselines failed for ${symbol}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
        return null
      }),
    ])

    let targetRange: ForecastResponse['data']['targetRange'] = undefined
    const rawPredictions: MlRawPrediction[] = mlResponse.data?.predictions || []
    let enhancedPredictions: Prediction[] = []

    if (rawPredictions.length > 0 && technicals) {
      const basePrices = rawPredictions.map((p) =>
        Number(p.price ?? p.predicted_close),
      )
      targetRange = computeSummaryTargets(basePrices, technicals)
      enhancedPredictions = computeEnhancedPredictions(
        rawPredictions,
        technicals,
      )
    }

    return {
      ...mlResponse.data,
      predictions: enhancedPredictions,
      targetRange,
    }
  } catch (err) {
    logger.error(
      `ML Forecast fetch failed for ${symbol}`,
      err instanceof Error ? err.message : err,
    )
    throw new Error(`Failed to fetch and process forecast for ${symbol}`)
  }
}
