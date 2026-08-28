import router from './routes'
import { defineModule } from '../module-interface'

export const newsModule = defineModule({
  name: 'news',
  route: '/api/v1/news',
  router,
})
export {
  mapPolygonCategory,
  mapPolygonSentiment,
} from './infrastructure/news-fetcher'
