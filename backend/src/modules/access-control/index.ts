import router from './routes'
import { defineModule } from '../module-interface'

export const accessControlModule = defineModule({ name: 'access-control', route: '/api/v1/rbac', router })
export { rbacMiddleware } from './middleware'
export { Action, Resource } from './permissions'
