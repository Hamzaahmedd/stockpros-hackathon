import router from './routes'
import { defineModule } from '../module-interface'

export const feedbackModule = defineModule({
  name: 'feedback',
  route: '/api/v1/feedback',
  router,
})
