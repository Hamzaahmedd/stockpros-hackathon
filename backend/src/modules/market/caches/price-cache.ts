import { WatchlistItemResponse } from '../../watchlist';

export const MAX_WATCHLIST_ITEMS = 50

export function formatWatchlistItem(entry: {
  symbol: string;
  targetEntryPrice: number | null;
  stopLoss: number | null;
  notes: string | null;
  aiSuggestedEntry: number | null;
  aiTakeProfit: number | null;
  aiStopLoss: number | null;
  aiConfidence: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  aiSuggestionBasis: string | null;
  aiComputedAt: Date | null;
  createdAt: Date;
  alerts?: any[];
}): WatchlistItemResponse {
  const hasAiData =
    entry.aiSuggestedEntry !== null &&
    entry.aiTakeProfit !== null &&
    entry.aiStopLoss !== null &&
    entry.aiConfidence !== null &&
    entry.aiSuggestionBasis !== null && // basis is mandatory per spec
    entry.aiComputedAt !== null;

  return {
    symbol: entry.symbol,
    currentPrice: null,
    changePercent: null,
    priceSinceAdded: null,
    targetEntryPrice: entry.targetEntryPrice,
    stopLoss: entry.stopLoss,
    notes: entry.notes,
    entryZone: null,
    stopLossBreached: null,
    aiSuggested: hasAiData
      ? {
          entry: entry.aiSuggestedEntry!,
          takeProfit: entry.aiTakeProfit!,
          stopLoss: entry.aiStopLoss!,
          confidence: entry.aiConfidence!,
          basis: entry.aiSuggestionBasis!,
          computedAt: entry.aiComputedAt!.toISOString(),
        }
      : null,
    portfolioFit: null,
    addedAt: entry.createdAt,
    logo: null,
    alerts: entry.alerts,
  };
}

import finnhubClient from '../../../shared/infrastructure/clients/finnhub-client';
import type { PriceCacheEntry } from '../types';

const REST_CACHE_TTL_MS = 60_000; // 60 seconds per spec

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Cache ────────────────────────────────────────────────────────────────────

/**
 * Single in-memory store for all symbol prices.
 * Populated by:
 *   - WebSocket ticks (finnhubWs.ts) on every trade event
 *   - Finnhub REST fallback when a symbol is not yet in cache
 *
 * Replace with Redis when scaling horizontally (spec §7).
 */
export const priceCache = new Map<string, PriceCacheEntry>();

// ─── Write (called by WebSocket tick handler) ─────────────────────────────────

/**
 * Update price and volume from a live WebSocket trade tick.
 * changePercent is preserved from the last REST fetch — WS ticks do not include it.
 * Updating timestamp on every tick keeps the entry "fresh" so REST fallback
 * is never triggered for actively-streaming symbols.
 */
export const updatePriceCache = (
  symbol: string,
  price:  number,
  volume: number,
): void => {
  const existing = priceCache.get(symbol);
  priceCache.set(symbol, {
    price,
    changePercent: existing?.changePercent ?? 0,
    volume,
    timestamp: Date.now(),
  });
};

// ─── REST Fallback ────────────────────────────────────────────────────────────

/**
 * Fetch a full quote from Finnhub REST and write it into the cache.
 * This is the only path that populates changePercent.
 * Called when a symbol is not yet in the cache or when the entry is stale.
 */
export const fetchAndCacheQuote = async (symbol: string): Promise<PriceCacheEntry> => {
  const { data } = await finnhubClient.get<{
    c: number;  // current price
    dp: number; // percent change
    v: number;  // volume (not always present)
  }>(`/quote`, {
    params: { symbol },
  });

  const entry: PriceCacheEntry = {
    price:         data.c,
    changePercent: data.dp,
    volume:        data.v ?? 0,
    timestamp:     Date.now(),
  };

  priceCache.set(symbol, entry);
  return entry;
};

export const getCurrentPrice = async (
  symbol: string,
): Promise<PriceCacheEntry | null> => {
  const cached = priceCache.get(symbol);

  if (cached && Date.now() - cached.timestamp < REST_CACHE_TTL_MS) {
    return cached;
  }

  try {
    return await fetchAndCacheQuote(symbol);
  } catch (err) {
    console.error(`[PriceCache] REST fallback failed for ${symbol}:`, err);
    return cached ?? null; // return stale rather than nothing
  }
};
