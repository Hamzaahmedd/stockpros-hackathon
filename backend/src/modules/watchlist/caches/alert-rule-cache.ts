import type { WatchlistAlert } from '@prisma/client';
import { prisma } from '../../../shared/infrastructure/database';


const alertRuleCache = new Map<string, WatchlistAlert[]>();

// ─── Read (called by Alert Evaluation Engine in M6) ───────────────────────────
export const getActiveAlertsForSymbol = async (
  symbol: string,
): Promise<WatchlistAlert[]> => {
  if (alertRuleCache.has(symbol)) {
    return alertRuleCache.get(symbol)!;
  }

  // Cache miss — load from DB and populate
  const alerts = await prisma.watchlistAlert.findMany({
    where: {
      isActive: true,
      watchlist: { symbol },
    },
  });

  alertRuleCache.set(symbol, alerts);
  return alerts;
};

// ─── Invalidation (called by alert CRUD service functions) ────────────────────
export const invalidateAlertCache = (symbol: string): void => {
  alertRuleCache.delete(symbol);
};


export const getAlertCacheStats = (): { cachedSymbols: number; symbols: string[] } => ({
  cachedSymbols: alertRuleCache.size,
  symbols:       Array.from(alertRuleCache.keys()),
});
