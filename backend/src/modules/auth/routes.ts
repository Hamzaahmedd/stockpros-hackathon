import express from 'express'
import * as AuthController from './controller'
import { authTokenMiddleware } from './middleware'
import { emailMagicLinkLimiter } from '../../shared/middlewares/security'

const router = express.Router()

// ─── Identity & Profile ──────────────────────────────────────────────────────
router.get('/me', authTokenMiddleware, AuthController.getMyInfo)
router.post('/magic-link', emailMagicLinkLimiter, AuthController.requestMagicLink)
router.post('/verify-magic-link', AuthController.verifyMagicLinkToken)
router.post('/onboarding', AuthController.completeOnboardingHandler)

// ─── Session Management ──────────────────────────────────────────────────────
router.post('/refresh-token', AuthController.refreshToken)
router.post('/logout', AuthController.logout)

export default router

