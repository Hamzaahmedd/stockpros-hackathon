// Export the public authorization contract before loading route modules, which
// may be reached while another feature module is initializing.
export { allRbacMiddleware, rbacMiddleware } from './middleware'
export { Action, Resource } from './permissions'

import router from './routes'
import { defineModule } from '../module-interface'

export const accessControlModule = defineModule({
  name: 'access-control',
  route: '/api/v1/rbac',
  router,
})
