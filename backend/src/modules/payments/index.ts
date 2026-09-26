import { defineModule } from '../module-interface'
import router from './routes'

export const paymentsModule = defineModule({
  name: 'payments',
  route: '/api/v1/payments',
  router,
})
