// Consolidated forecast service
import { ForecastResponse } from './types'
import mlClient from '../../shared/infrastructure/clients/ml-client'
import { getTechnicalBaselines } from '../watchlist'

const ATR_MULT = 1.5

export async function getForecast(
  symbol: string,
  period: string,
): Promise<ForecastResponse> {
  const params: Record<string, string> = { symbol, period }

  try {
    const [mlResponse, technicals] = await Promise.all([
      mlClient.get(`/api/v1/forecast`, { params }),
      getTechnicalBaselines(symbol).catch((err) => {
        console.warn(
          `[Forecast] Technical baselines failed for ${symbol}:`,
          (err as Error).message,
        )
        return null
      }),
    ])

    let targetRange: ForecastResponse['data']['targetRange'] = undefined
    let rawPredictions = mlResponse.data?.predictions || []
    let enhancedPredictions = []

    if (rawPredictions.length > 0 && technicals) {
      const { atr, ema, swingLow, resistance } = technicals

      // Extract all base prices for the period to find Highs and Lows
      const basePrices = rawPredictions.map(
        (p: any) => p.price ?? p.predicted_close,
      )
      const periodHigh = Math.max(...basePrices)
      const periodLow = Math.min(...basePrices)
      const terminalPrice = basePrices[basePrices.length - 1]

      // SUMMARY CARDS LOGIC (Using Period Extremes)
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

      targetRange = {
        bull: parseFloat(summaryBull.toFixed(2)),
        base: parseFloat(terminalPrice.toFixed(2)),
        bear: parseFloat(summaryBear.toFixed(2)),
        atr: parseFloat(atr.toFixed(2)),
        confidence,
      }

      const currentPrice = technicals.currentPrice
      // CHART LOGIC (Mapping to clean keys only)
      enhancedPredictions = rawPredictions.map((p: any, index: number) => {
        const rawBase = p.price ?? p.predicted_close
        const isToday = index === 0

        let pointBull = rawBase + ATR_MULT * atr
        let pointBear = rawBase - ATR_MULT * atr

        // Apply support/resistance bounds
        if (
          resistance !== null &&
          resistance < pointBull &&
          resistance >= rawBase
        )
          pointBull = resistance
        if (support > pointBear && support <= rawBase) pointBear = support

        return {
          date: p.date,
          base: parseFloat(rawBase.toFixed(2)),
          bull: parseFloat(pointBull.toFixed(2)),
          bear: parseFloat(pointBear.toFixed(2)),
        }
      })
    }

    // Return the combined payload
    const combinedData: ForecastResponse = {
      ...mlResponse.data,
      predictions: enhancedPredictions,
      targetRange,
    }

    return combinedData
  } catch (err) {
    console.error(
      `ML Forecast fetch failed for ${symbol}:`,
      (err as Error).message,
    )
    throw new Error(`Failed to fetch and process forecast for ${symbol}`)
  }
}
