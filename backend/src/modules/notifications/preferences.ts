export const MARKET_INTERESTS = [
  'ai_tech',
  'energy',
  'finance',
  'healthcare',
  'growth',
  'crypto',
  'consumer',
  'value',
] as const

export type MarketInterest = (typeof MARKET_INTERESTS)[number]
