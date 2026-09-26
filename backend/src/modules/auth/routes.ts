import config from '@/config'
import express from 'express'
import * as AuthController from './controller'
import { authTokenMiddleware } from './middleware'
import {
  emailMagicLinkLimiter,
  loginLimiter,
  phoneOtpRequestLimiter,
  phoneOtpVerifyLimiter,
} from '../../shared/middlewares/security'

const router = express.Router()

// ─── Identity & Profile ──────────────────────────────────────────────────────
router.get('/me', authTokenMiddleware, AuthController.getMyInfo)
router.post(
  '/magic-link',
  emailMagicLinkLimiter,
  AuthController.requestMagicLink,
)
router.post('/verify-magic-link', AuthController.verifyMagicLinkToken)
router.post('/google', loginLimiter, AuthController.googleLogin)
router.post('/onboarding', AuthController.completeOnboardingHandler)

// ─── Self-Serve Plan Selection ───────────────────────────────────────────────
// No RBAC/tier check — any logged-in user may set their own plan directly;
// there's no payment processor yet, so this is the whole "checkout" flow.
router.post('/plan', authTokenMiddleware, AuthController.updateMyPlan)

// ─── Session Management ──────────────────────────────────────────────────────
router.post('/refresh-token', AuthController.refreshToken)
router.post('/logout', AuthController.logout)

// ─── Account Deletion ────────────────────────────────────────────────────────
router.delete('/account', authTokenMiddleware, AuthController.deleteAccount)

// ─── Phone Verification (WhatsApp OTP) ───────────────────────────────────────
// Route registration is skipped entirely (not just flag-checked in the
// handler) when phone verification is disabled for this environment —
// mirrors the Swagger-gating convention in app.ts. Previously this lived in
// its own module (modules/index.ts conditionally excluded the whole module
// from the `modules` array); now that phone verification lives inside auth
// (which is always registered), the same all-or-nothing gating is applied
// here, at route-registration time, instead.
if (config.features.enablePhoneVerification) {
  router.post(
    '/phone-verification/request',
    authTokenMiddleware,
    phoneOtpRequestLimiter,
    AuthController.requestOtpHandler,
  )
  router.post(
    '/phone-verification/verify',
    authTokenMiddleware,
    phoneOtpVerifyLimiter,
    AuthController.verifyOtpHandler,
  )
}

export default router
