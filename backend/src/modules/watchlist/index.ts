import router from './routes'
import { defineModule } from '../module-interface'

export const watchlistModule = defineModule({ name: 'watchlist', route: '/api/v1/watchlist', router })
export { getTechnicalBaselines } from './evaluators/ai-zone-calculator'
export { evaluateAlertForDevelopment } from './evaluators/alert-evaluator'
export type { WatchlistItemResponse } from './types'
