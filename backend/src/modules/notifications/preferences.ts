export const MARKET_INTERESTS = [
  'ai_tech',
  'energy',
  'finance',
  'healthcare',
  'growth',
  'consumer',
] as const

export type MarketInterest = (typeof MARKET_INTERESTS)[number]
