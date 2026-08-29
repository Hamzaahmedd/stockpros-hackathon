import { Router } from 'express'
import * as SearchController from './controller'
import { authTokenMiddleware as authenticate } from '../auth'

const router = Router()

router.use(authenticate)

router.get('/symbol-lookup', SearchController.symbolLookup)

export default router
