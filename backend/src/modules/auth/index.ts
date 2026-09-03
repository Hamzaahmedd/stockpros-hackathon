// Export middleware before loading the router. This keeps the public auth
// contract available to modules that are imported while route modules load.
export { authTokenMiddleware } from './middleware'
export type { AuthenticatedRequest } from './types'

import router from './routes'
import { defineModule } from '../module-interface'

export const authModule = defineModule({
  name: 'auth',
  route: '/api/v1/auth',
  router,
})
