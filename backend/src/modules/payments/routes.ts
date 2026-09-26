import config from '@/config'
import express from 'express'
import { authTokenMiddleware } from '../auth'
import * as PaymentsController from './controller'

const router = express.Router()

// ─── Safepay Checkout (Payment Mode only) ────────────────────────────────────
// Registered only when config.features.enablePaymentProcessor is on, mirroring
// the phone-verification route-registration gate in auth/routes.ts — in
// Bypass Mode this route simply doesn't exist (404) rather than needing an
// in-handler flag check.
if (config.features.enablePaymentProcessor) {
  router.post(
    '/create-checkout',
    authTokenMiddleware,
    PaymentsController.createCheckout,
  )
}

// ─── Webhook & Verification (always registered) ──────────────────────────────
// A webhook can still arrive after enablePaymentProcessor is flipped off
// mid-flight; it must be durably recorded rather than silently 404ing.
router.post('/safepay/webhook', PaymentsController.safepayWebhook)
router.post(
  '/verify-tracker',
  authTokenMiddleware,
  PaymentsController.verifyTrackerHandler,
)

export default router
