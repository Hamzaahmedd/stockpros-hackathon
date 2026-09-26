/**
 * In Payment Mode (config.features.enablePaymentProcessor === true), the
 * Bypass Mode self-serve endpoint (POST /auth/plan) must stop being a valid
 * way to reach PRO — otherwise a user could bypass Safepay checkout entirely
 * by calling this endpoint directly. Downgrading to FREE must still work in
 * both modes.
 *
 * Exercises the real Express app (not the controller directly) to avoid the
 * auth/controller <-> auth/routes circular-import chain that importing
 * controller.ts standalone triggers; mirrors the infrastructure-mocking
 * strategy in phone-verification.route-registration.test.ts.
 */

jest.mock('@/config', () => {
  const actual = jest.requireActual('@/config')
  const patched = {
    ...actual.default,
    features: { ...actual.default.features, enablePaymentProcessor: true },
  }
  return {
    __esModule: true,
    default: patched,
    config: patched,
  }
})

jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client')
  return {
    ...actual,
    PrismaClient: jest.fn().mockImplementation(() => ({
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      userSession: { findUnique: jest.fn().mockResolvedValue(null) },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ plan: 'FREE' }),
      },
    })),
  }
})

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
  }))
})

jest.mock('../../market/infrastructure/finnhub-stream', () => ({
  finnhubService: {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    getQuote: jest.fn().mockResolvedValue({ c: 100, d: 1 }),
  },
}))

import jwt from 'jsonwebtoken'
import request from 'supertest'
import { createApp } from '../../../app'
import { prisma } from '../../../shared/infrastructure/database'

// Signed without a `jti` claim — authTokenMiddleware only hits the DB for
// session lookup when a jti is present, defaulting plan to FREE otherwise.
// That's irrelevant here since the guard being tested runs regardless of the
// caller's current plan.
const bearerToken = jwt.sign({ sub: 'user-1' }, 'test-access-secret', {
  expiresIn: '1h',
})

describe('POST /api/v1/auth/plan — Payment Mode guard', () => {
  it('rejects a PRO upgrade with 403 instead of upgrading', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/v1/auth/plan')
      .set('Authorization', `Bearer ${bearerToken}`)
      .send({ plan: 'PRO' })

    expect(res.status).toBe(403)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('still allows downgrading to FREE', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/v1/auth/plan')
      .set('Authorization', `Bearer ${bearerToken}`)
      .send({ plan: 'FREE' })

    expect(res.status).toBe(200)
  })
})
