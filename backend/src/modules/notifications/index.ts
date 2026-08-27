import { defineModule } from '../module-interface'
import router from './routes'

export const notificationsModule = defineModule({ name: 'notifications', route: '/api/v1/notifications', router })
export { dispatchNotification } from './notification-dispatcher'

