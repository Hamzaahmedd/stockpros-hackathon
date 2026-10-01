import { Router } from 'express'
import * as SearchController from './controller'
import { authTokenMiddleware as authenticate } from '../auth'
import { trackSearchUsage } from '../payments/public'

const router = Router()

router.use(authenticate)

router.get('/symbol-lookup', trackSearchUsage, SearchController.symbolLookup)

export default router
