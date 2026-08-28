import router from './routes'
import { defineModule } from '../module-interface'

export const dashboardModule = defineModule({
  name: 'dashboard',
  route: '/api/v1/dashboard',
  router,
})
