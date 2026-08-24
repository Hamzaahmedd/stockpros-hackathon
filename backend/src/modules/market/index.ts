import { defineModule } from '../module-interface'
import router from './routes'

export const marketModule = defineModule({ name: 'market', route: '/api/v1/market', router })
export { getCompanyLogo } from './caches/logo-cache'
export { formatWatchlistItem, getCurrentPrice, MAX_WATCHLIST_ITEMS, priceCache } from './caches/price-cache'
export { finnhubService } from './infrastructure/finnhub-stream'
export { getCompanySectors, getLivePrices, getRankedTopStocks } from './service'
export type { RankedStockRow, StockQuote } from './types'

