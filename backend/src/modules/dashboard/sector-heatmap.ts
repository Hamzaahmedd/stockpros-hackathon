import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import {
  DASHBOARD_SECTOR_CACHE_KEY,
  DASHBOARD_SECTOR_CACHE_TTL,
} from './constants'
import type { SectorHeatmapItem, SectorSignal } from './types'
import { getCache, setCache } from '../../shared/infrastructure/cache'
import yahoo from '../../shared/infrastructure/clients/yahoo-finance-client'
import { convertToMilliseconds } from '../../shared/utils'
import { getCompanySectors } from '../market'

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

export const normalizeSectorName = (
  sector: string | null | undefined,
): string => {
  if (!sector) return 'Unknown'
  const s = sector.trim().toLowerCase()

  if (
    // "biotechnology".includes('tech') is true, so without this exclusion
    // biotech holdings were classified as Information Technology and never
    // reached the (correct) 'biotech' check in the Health Care block below.
    !s.includes('biotech') &&
    (s.includes('tech') ||
      s.includes('software') ||
      s.includes('semiconductor') ||
      s.includes('hardware') ||
      s.includes('it services'))
  ) {
    return 'Information Technology'
  }
  if (
    s.includes('health') ||
    s.includes('biotech') ||
    s.includes('pharma') ||
    s.includes('drug') ||
    s.includes('medical') ||
    s.includes('life science')
  ) {
    return 'Health Care'
  }
  if (
    s.includes('financ') ||
    s.includes('bank') ||
    s.includes('insurance') ||
    s.includes('capital market')
  ) {
    return 'Financials'
  }
  if (
    s.includes('consumer cycl') ||
    s.includes('discretionary') ||
    s.includes('auto') ||
    s.includes('retail') ||
    s.includes('apparel') ||
    s.includes('leisure')
  ) {
    return 'Consumer Discretionary'
  }
  if (
    s.includes('consumer def') ||
    s.includes('staple') ||
    s.includes('food') ||
    s.includes('beverage') ||
    s.includes('tobacco') ||
    s.includes('household')
  ) {
    return 'Consumer Staples'
  }
  if (
    s.includes('energy') ||
    s.includes('oil') ||
    s.includes('gas') ||
    s.includes('fuel')
  ) {
    return 'Energy'
  }
  if (
    s.includes('industrial') ||
    s.includes('aerospace') ||
    s.includes('defense') ||
    s.includes('machinery') ||
    s.includes('transport') ||
    s.includes('airline')
  ) {
    return 'Industrials'
  }
  if (
    s.includes('material') ||
    s.includes('chemical') ||
    s.includes('metal') ||
    s.includes('mining')
  ) {
    return 'Materials'
  }
  if (s.includes('real estate') || s.includes('reit')) {
    return 'Real Estate'
  }
  if (s.includes('utilit') || s.includes('electric') || s.includes('water')) {
    return 'Utilities'
  }
  if (
    s.includes('communication') ||
    s.includes('telecom') ||
    s.includes('media') ||
    s.includes('entertainment') ||
    s.includes('interactive')
  ) {
    return 'Communication Services'
  }

  const exact = Object.keys(SECTOR_ETF_MAP).find((k) => k.toLowerCase() === s)
  if (!exact) {
    // Unrecognized provider wording falls through uncategorized — log it so
    // gaps in the substring rules above are visible instead of silently
    // skewing sector-concentration numbers.
    logger.warn(
      `[Dashboard] Unrecognized sector "${sector}" — leaving unnormalized`,
    )
    return sector
  }
  return exact
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
          period1: new Date(Date.now() - (convertToMilliseconds('40d') ?? 0)),
          interval: '1d',
        })

        const quotes = history.quotes.filter((q) => q.close !== null)

        if (quotes.length > 20) {
          const current = quotes.at(-1)!.close!
          const prev1d = quotes.at(-2)!.close!
          const prev5d = quotes.at(-6)!.close!
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

  // 2. Calculate User Exposure
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

  // Live-fetch sectors for any position that has a missing/unknown sector in the DB.
  // getCompanySectors is backed by Redis cache so this is cheap on repeat calls.
  const missingSymbols = [
    ...new Set(
      positions
        .filter((p) => !p.sector || p.sector === 'Unknown')
        .map((p) => p.symbol),
    ),
  ]
  const liveSectorMap: Record<string, string> =
    missingSymbols.length > 0 ? await getCompanySectors(missingSymbols) : {}

  const sectorValueMap = new Map<string, { value: number; symbols: string[] }>()

  positions.forEach((p) => {
    // Prefer the DB-stored sector; fall back to the live-fetched value.
    const rawSector =
      p.sector && p.sector !== 'Unknown'
        ? p.sector
        : (liveSectorMap[p.symbol] ?? 'Unknown')
    const sector = normalizeSectorName(rawSector)
    const val = p.quantity * p.avgEntryPrice
    const entry = sectorValueMap.get(sector) ?? { value: 0, symbols: [] }
    entry.value += val
    if (!entry.symbols.includes(p.symbol)) entry.symbols.push(p.symbol)
    sectorValueMap.set(sector, entry)
  })

  const parsePercent = (str: string): number => {
    if (!str) return 0
    return Number.parseFloat(str.replace('%', '')) || 0
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
