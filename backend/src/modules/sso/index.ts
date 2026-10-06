// Public surface of the SSO module. Callers depend on the port, never on a provider.
export * from './provider'
export * from './types'
export {
  certificateExpiry,
  validateConnectionConfig,
} from './connection-config'
export { parseIdpMetadata } from './metadata'
export { fetchMetadataDocument } from './safe-fetch'
export { createSsoProvider, serviceProviderFor, startSsoTest } from './service'

import router from './routes'
import { SSO_ROUTE_BASE } from './service'
import { defineModule } from '../module-interface'

export const ssoModule = defineModule({
  name: 'sso',
  route: SSO_ROUTE_BASE,
  router,
})
