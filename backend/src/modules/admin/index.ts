import { defineModule } from '../module-interface'
import router from './routes'

export const adminModule = defineModule({
  name: 'admin',
  route: '/api/v1/admin',
  router,
})
