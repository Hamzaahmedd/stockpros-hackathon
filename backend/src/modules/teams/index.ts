import { defineModule } from '../module-interface'
import router from './routes'

export const teamsModule = defineModule({
  name: 'teams',
  route: '/api/v1/teams',
  router,
})
