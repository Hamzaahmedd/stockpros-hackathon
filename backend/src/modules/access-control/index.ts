// Export the public authorization contract before loading route modules, which
// may be reached while another feature module is initializing.
export { allRbacMiddleware, rbacMiddleware } from './middleware'
export { Action, Resource } from './permissions'
export {
  hasPlatformRole,
  PLATFORM_ROLE_RANK,
  requirePlatformRole,
  requirePricingTiersEnabled,
} from './platform-role'
export { AdminTargetType, logAdminAction, logAdminRead } from './admin-audit'
export {
  alertAdminAction,
  RISKY_ADMIN_ACTIONS,
  STEP_UP_LOCKOUT_ALERT,
} from './admin-alert'
export { requireAllowedIp } from './ip-allowlist'
export { requireStepUp } from './step-up'
export type { AdminAuditEvent } from './admin-audit'

import router from './routes'
import { defineModule } from '../module-interface'

export const accessControlModule = defineModule({
  name: 'access-control',
  route: '/api/v1/rbac',
  router,
})
