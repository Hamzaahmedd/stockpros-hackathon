import router from './routes'
import { defineModule } from '../module-interface'

export const notificationsModule = defineModule({ name: 'notifications', route: '/api/v1/notifications', router })
export { dispatchNotification } from './notification-dispatcher'

