import type { AiConfidence } from '@prisma/client';
import type { AiZones, Candle, TechnicalBaselines } from '../types';
import twelveDataClient from '../../../shared/infrastructure/clients/twelve-data-client';
import { prisma } from '../../../shared/infrastructure/database';

// ─── Constants ────────────────────────────────────────────────────────────────

const EMA_PERIOD   = 20;  // 20-day EMA for support identification
const ATR_PERIOD   = 14;  // 14-day ATR for volatility-adjusted stop loss
const ATR_MULT     = 1.5; // stop loss placed 1.5x ATR below entry (spec §5)
const RR_MIN       = 2.0; // minimum 2:1 risk/reward for take profit (spec §5)
const CANDLE_COUNT = 60;  // fetch 60 days so we have enough history for both EMA and ATR

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Twelve Data Fetcher ──────────────────────────────────────────────────────

/**
 * Fetch daily OHLC candles for a symbol from Twelve Data.
 * Returns candles in ascending chronological order (oldest first).
 */
const fetchCandles = async (symbol: string): Promise<Candle[]> => {
  const { data } = await twelveDataClient.get<{
    status: string;
    values: Array<{
      datetime: string;
      open:     string;
      high:     string;
      low:      string;
      close:    string;
      volume:   string;
    }>;
    message?: string;
  }>(`/time_series`, {
    params: {
      symbol,
      interval:   '1day',
      outputsize: CANDLE_COUNT,
      adjust:     'splits',
    },
  });

  if (data.status === 'error') {
    throw new Error(`Twelve Data error for ${symbol}: ${data.message}`);
  }

  if (!Array.isArray(data.values) || data.values.length === 0) {
    throw new Error(`No candle data returned for ${symbol}`);
  }

  // Twelve Data returns newest-first — reverse to ascending (oldest first)
  return data.values
    .map((v) => ({
      datetime: v.datetime,
      open:     parseFloat(v.open),
      high:     parseFloat(v.high),
      low:      parseFloat(v.low),
      close:    parseFloat(v.close),
      volume:   parseFloat(v.volume),
    }))
    .reverse();
};

// ─── Technical Indicators ─────────────────────────────────────────────────────

/**
 * Compute Exponential Moving Average over `period` days.
 * Seeds with SMA of the first `period` candles, then applies
 * the standard EMA multiplier: 2 / (period + 1).
 *
 * Returns the final EMA value (most recent).
 */
const computeEMA = (candles: Candle[], period: number): number => {
  if (candles.length < period) {
    throw new Error(`Not enough candles to compute ${period}-day EMA`);
  }

  const multiplier = 2 / (period + 1);

  // Seed: SMA of the first `period` closes
  const seed = candles
    .slice(0, period)
    .reduce((sum, c) => sum + c.close, 0) / period;

  // Apply EMA from candle `period` onward
  let ema = seed;
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * multiplier + ema * (1 - multiplier);
  }

  return ema;
};

/**
 * Compute Average True Range over `period` days.
 * True Range = max(high - low, |high - prevClose|, |low - prevClose|)
 * ATR = simple average of TR over the last `period` candles.
 */
const computeATR = (candles: Candle[], period: number): number => {
  if (candles.length < period + 1) {
    throw new Error(`Not enough candles to compute ${period}-day ATR`);
  }

  const trValues: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr      = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prevClose),
      Math.abs(curr.low  - prevClose),
    );
    trValues.push(tr);
  }

  // Use the last `period` TR values for the average
  const recentTR = trValues.slice(-period);
  return recentTR.reduce((sum, tr) => sum + tr, 0) / recentTR.length;
};

/**
 * Identify swing lows in the last `lookback` candles.
 * A swing low is a candle whose low is lower than both its neighbours.
 * Returns the lowest of all identified swing lows.
 */
const findSwingLow = (candles: Candle[], lookback = 20): number | null => {
  const window = candles.slice(-lookback);
  const swingLows: number[] = [];

  for (let i = 1; i < window.length - 1; i++) {
    if (window[i].low < window[i - 1].low && window[i].low < window[i + 1].low) {
      swingLows.push(window[i].low);
    }
  }

  return swingLows.length > 0 ? Math.min(...swingLows) : null;
};

/**
 * Identify swing highs in the last `lookback` candles.
 * A swing high is a candle whose high is greater than both its neighbours.
 * Returns the nearest (lowest) of all identified swing highs above the entry.
 */
const findNearestResistance = (
  candles:  Candle[],
  abovePrice: number,
  lookback  = 20,
): number | null => {
  const window = candles.slice(-lookback);
  const swingHighs: number[] = [];

  for (let i = 1; i < window.length - 1; i++) {
    if (
      window[i].high > window[i - 1].high &&
      window[i].high > window[i + 1].high &&
      window[i].high > abovePrice
    ) {
      swingHighs.push(window[i].high);
    }
  }

  return swingHighs.length > 0 ? Math.min(...swingHighs) : null;
};

// ─── Confidence Scorer ────────────────────────────────────────────────────────

/**
 * Signal agreement rules:
 *   HIGH   — EMA support and swing low are within 1% of each other
 *   MEDIUM — only one support signal is present (EMA or swing low, not both)
 *   LOW    — no swing lows found; entry is based on EMA alone
 */
const scoreConfidence = (
  ema:      number,
  swingLow: number | null,
): AiConfidence => {
  if (swingLow === null) return 'LOW';
  const divergence = Math.abs(ema - swingLow) / ema;
  return divergence <= 0.01 ? 'HIGH' : 'MEDIUM';
};

// ─── Basis Text Builder ───────────────────────────────────────────────────────

const buildBasis = (
  ema:        number,
  atr:        number,
  swingLow:   number | null,
  entry:      number,
  stopLoss:   number,
  takeProfit: number,
  resistance: number | null,
): string => {
  const parts: string[] = [];

  parts.push(
    `Entry near ${swingLow !== null ? 'swing low' : '20-day EMA'} support at $${entry.toFixed(2)}.`,
  );
  parts.push(
    `Stop placed ${ATR_MULT}x ATR ($${atr.toFixed(2)}) below entry at $${stopLoss.toFixed(2)}.`,
  );

  if (resistance !== null) {
    parts.push(
      `Take profit at prior resistance level $${takeProfit.toFixed(2)}.`,
    );
  } else {
    parts.push(
      `Take profit at ${RR_MIN}:1 risk/reward ratio ($${takeProfit.toFixed(2)}) — no clear resistance found.`,
    );
  }

  parts.push(`20-day EMA: $${ema.toFixed(2)}.`);

  return parts.join(' ');
};

// ─── Technical Baselines (no DB writes) ───────────────────────────────────────

/**
 * Raw technical metrics used by the forecast service to build
 * Bull / Base / Bear price target ranges around a GRU prediction.
 */
/**
 * Compute and return raw technical baselines for a symbol.
 * This is a pure read — it does NOT write to the database.
 */
export const getTechnicalBaselines = async (
  symbol: string,
): Promise<TechnicalBaselines> => {
  const candles = await fetchCandles(symbol);

  if (candles.length < EMA_PERIOD + ATR_PERIOD) {
    throw new Error(
      `Insufficient candle history for ${symbol}: got ${candles.length}, need ${EMA_PERIOD + ATR_PERIOD}`,
    );
  }

  const ema          = computeEMA(candles, EMA_PERIOD);
  const atr          = computeATR(candles, ATR_PERIOD);
  const swingLow     = findSwingLow(candles, EMA_PERIOD);
  const currentPrice = candles[candles.length - 1].close;
  const resistance   = findNearestResistance(candles, currentPrice);

  return { atr, ema, swingLow, resistance, currentPrice };
};

// ─── Main Computation ─────────────────────────────────────────────────────────

/**
 * Compute AI-suggested trade zones for a symbol and persist them to the DB.
 *
 * Called as a fire-and-forget job after a user adds a symbol to their watchlist.
 * Also called by the daily cron job in M8 for recomputation on >5% price move.
 *
 * If any step fails (Twelve Data error, insufficient data, etc.):
 *   - The error is logged
 *   - No partial data is written — spec §5: suppress the entire suggestion
 *     if basis cannot be computed
 *   - The watchlist entry remains valid; aiSuggested stays null
 */
export const computeAndStoreAiZones = async (
  userId: string,
  symbol: string,
): Promise<void> => {
  try {
    // ── 1. Fetch candles ───────────────────────────────────────────────────
    const candles = await fetchCandles(symbol);

    if (candles.length < EMA_PERIOD + ATR_PERIOD) {
      throw new Error(
        `Insufficient candle history for ${symbol}: got ${candles.length}, need ${EMA_PERIOD + ATR_PERIOD}`,
      );
    }

    // ── 2. Compute indicators ──────────────────────────────────────────────
    const ema      = computeEMA(candles, EMA_PERIOD);
    const atr      = computeATR(candles, ATR_PERIOD);
    const swingLow = findSwingLow(candles, EMA_PERIOD);

    // ── 3. Entry: lower of EMA and swing low (prefer swing low as it is
    //      the most recent tested support level)
    const entry = swingLow !== null
      ? Math.min(ema, swingLow)
      : ema;

    // ── 4. Stop loss: 1.5x ATR below entry
    const stopLoss = entry - ATR_MULT * atr;

    // ── 5. Take profit: nearest resistance above entry, with 2:1 floor
    const minTakeProfit = entry + RR_MIN * (entry - stopLoss);
    const resistance    = findNearestResistance(candles, entry);

    const takeProfit =
      resistance !== null && resistance > minTakeProfit
        ? resistance
        : minTakeProfit;

    // ── 6. Confidence and basis ────────────────────────────────────────────
    const confidence = scoreConfidence(ema, swingLow);
    const basis      = buildBasis(
      ema, atr, swingLow, entry, stopLoss, takeProfit, resistance,
    );

    // ── 7. Persist — all fields or nothing (spec §5) ───────────────────────
    await prisma.watchlist.update({
      where: { userId_symbol: { userId, symbol } },
      data: {
        aiSuggestedEntry:  entry,
        aiTakeProfit:      takeProfit,
        aiStopLoss:        stopLoss,
        aiConfidence:      confidence,
        aiSuggestionBasis: basis,
        aiComputedAt:      new Date(),
      },
    });

    console.log(`[AIZones] Computed zones for ${symbol} — confidence: ${confidence}`);
  } catch (err) {
    // Suppress entire suggestion on any failure (spec §5)
    // Do NOT write partial data
    console.error(`[AIZones] Failed to compute zones for ${symbol}:`, err);
  }
};
