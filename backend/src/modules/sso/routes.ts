import config from '@/config'
import express, { NextFunction, Request, Response } from 'express'
import { FeatureDisabledError } from '../../shared/errors'
import { ssoLimiter } from '../../shared/middlewares/security'
import * as SsoController from './controller'
import { MAX_SAML_RESPONSE_CHARS } from './validation'

const router = express.Router()

/** SSO is dark until switched on: every route answers 403 while the flag is off. */
const requireSsoEnabled = (
  _req: Request,
  _res: Response,
  next: NextFunction,
) =>
  config.features.enableSso
    ? next()
    : next(new FeatureDisabledError('Single sign-on is not enabled'))

router.use(requireSsoEnabled, ssoLimiter)

router.post('/start', SsoController.startLogin)
router.post('/exchange', SsoController.exchange)
// IdPs post a form, not JSON, so the ACS route parses urlencoded bodies itself.
router.post(
  '/:tenantId/acs',
  express.urlencoded({
    extended: false,
    limit: MAX_SAML_RESPONSE_CHARS + 1024,
  }),
  SsoController.acs,
)

export default router
