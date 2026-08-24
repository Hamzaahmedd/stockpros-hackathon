import router from './routes'
import { defineModule } from '../module-interface'

export const authModule = defineModule({ name: 'auth', route: '/api/v1/auth', router })
export { authTokenMiddleware } from './middleware'
export type { AuthenticatedRequest } from './types'
