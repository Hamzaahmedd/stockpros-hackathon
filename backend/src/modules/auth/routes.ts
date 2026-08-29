import express from 'express'
import * as AuthController from './controller'
import { authTokenMiddleware } from './middleware'
import {
  emailMagicLinkLimiter,
  loginLimiter,
} from '../../shared/middlewares/security'

const router = express.Router()

// ─── Identity & Profile ──────────────────────────────────────────────────────

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication, session management, and onboarding
 */

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Authenticated user details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     user:
 *                       type: object
 *       401:
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorEnvelope'
 */
router.get('/me', authTokenMiddleware, AuthController.getMyInfo)

/**
 * @swagger
 * /api/v1/auth/magic-link:
 *   post:
 *     summary: Request a passwordless magic link
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Magic link sent (if account exists)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.post(
  '/magic-link',
  emailMagicLinkLimiter,
  AuthController.requestMagicLink,
)

/**
 * @swagger
 * /api/v1/auth/verify-magic-link:
 *   post:
 *     summary: Verify a magic link token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful or onboarding required
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     requiresOnboarding:
 *                       type: boolean
 *                     accessToken:
 *                       type: string
 *                     onboardingToken:
 *                       type: string
 */
router.post('/verify-magic-link', AuthController.verifyMagicLinkToken)

/**
 * @swagger
 * /api/v1/auth/google:
 *   post:
 *     summary: Authenticate via Google OAuth
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [credential]
 *             properties:
 *               credential:
 *                 type: string
 *                 description: Google ID token from the Sign-In button
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                     accessToken:
 *                       type: string
 */
router.post('/google', loginLimiter, AuthController.googleLogin)

/**
 * @swagger
 * /api/v1/auth/onboarding:
 *   post:
 *     summary: Complete user onboarding
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [onboardingToken, displayName]
 *             properties:
 *               onboardingToken:
 *                 type: string
 *               displayName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Onboarding completed (existing user)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 *       201:
 *         description: Account created (new user)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 */
router.post('/onboarding', AuthController.completeOnboardingHandler)

// ─── Session Management ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/auth/refresh-token:
 *   post:
 *     summary: Refresh an expired access token
 *     tags: [Auth]
 *     security:
 *       - CookieAuth: []
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *       401:
 *         description: No refresh token provided
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorEnvelope'
 */
router.post('/refresh-token', AuthController.refreshToken)

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Log out and invalidate refresh token
 *     tags: [Auth]
 *     security:
 *       - CookieAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.post('/logout', AuthController.logout)

export default router
