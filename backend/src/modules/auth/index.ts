// Export middleware before loading the router. This keeps the public auth
// contract available to modules that are imported while route modules load.
export { authTokenMiddleware } from './middleware'
export type { AuthenticatedRequest } from './types'
// Public cross-module surface — other modules (e.g. payments, to apply a
// webhook-confirmed plan upgrade) must import setMyPlan from here, never
// from './service' directly (enforced by scripts/check-module-boundaries.cjs).
export { setMyPlan } from './service'

import router from './routes'
import { defineModule } from '../module-interface'

export const authModule = defineModule({
  name: 'auth',
  route: '/api/v1/auth',
  router,
})
