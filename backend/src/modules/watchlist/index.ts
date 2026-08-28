import { defineModule } from '../module-interface'
import router from './routes'

export const watchlistModule = defineModule({
  name: 'watchlist',
  route: '/api/v1/watchlist',
  router,
})
export { getTechnicalBaselines } from './evaluators/ai-zone-calculator'
export type { WatchlistItemResponse } from './types'

