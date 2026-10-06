// Display-only mirrors of the backend pricing table (payments/constants.ts).
// The server always derives the amount charged — these never reach the API.

import type { MeteredFeature } from './types'

export const PRO_PRICE_PAISA = 599_900
export const TEAM_SEAT_PRICE_PAISA = 749_900
export const TEAM_MIN_SEATS = 2
export const TEAM_MAX_SEATS = 150

/** Credit drawn per AI signal once the monthly quota is used up (Rs 50). */
export const OVERAGE_COST_PAISA_PER_SIGNAL = 5_000

export type TopupPackId = 'PACK_500' | 'PACK_1000' | 'PACK_2500'

export const TOPUP_PACKS: readonly {
  id: TopupPackId
  pricePaisa: number
  signals: number
}[] = [
  { id: 'PACK_500', pricePaisa: 50_000, signals: 10 },
  { id: 'PACK_1000', pricePaisa: 100_000, signals: 20 },
  { id: 'PACK_2500', pricePaisa: 250_000, signals: 50 },
]

/** Display names for the metered AI actions, keyed by the API's feature id. */
export const METERED_FEATURE_LABELS: Record<MeteredFeature, string> = {
  ai_forecast: 'AI forecast',
  ai_decision: 'Market decision',
}
