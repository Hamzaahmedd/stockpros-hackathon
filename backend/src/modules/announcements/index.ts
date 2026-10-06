import { defineModule } from '../module-interface'
import router from './routes'

export const announcementsModule = defineModule({
  name: 'announcements',
  route: '/api/v1/announcements',
  router,
})
