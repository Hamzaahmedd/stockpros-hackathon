/**
 * Companion to route-registration.test.ts: proves the opposite branch of the
 * same route-registration gate in payments/routes.ts — with the feature flag
 * ON, /create-checkout and the new /subscription* routes must actually be
 * mounted (reachable, auth-gated) rather than 404ing.
 */

jest.mock('@/config', () => {
  const actual = jest.requireActual('@/config')
  const patched = {
    ...actual.default,
    features: { ...actual.default.features, enablePaymentProcessor: true },
  }
  return { __esModule: true, default: patched, config: patched }
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
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      paymentTransaction: { findUnique: jest.fn().mockResolvedValue(null) },
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

import request from 'supertest'
import config from '@/config'
import { createApp } from '../../../app'

describe('Payments — feature flag on', () => {
  it('config.features.enablePaymentProcessor is true for this suite', () => {
    expect(config.features.enablePaymentProcessor).toBe(true)
  })

  it('POST /api/v1/payments/create-checkout is mounted (401, not 404, without auth)', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/v1/payments/create-checkout')
      .send({ plan: 'PRO', paymentMethod: 'WALLET' })

    expect(res.status).toBe(401)
  })

  it('GET /api/v1/payments/subscription is mounted (401, not 404, without auth)', async () => {
    const app = createApp()
    const res = await request(app).get('/api/v1/payments/subscription')

    expect(res.status).toBe(401)
  })

  it('POST /api/v1/payments/subscription/renew is mounted (401, not 404, without auth)', async () => {
    const app = createApp()
    const res = await request(app).post('/api/v1/payments/subscription/renew')

    expect(res.status).toBe(401)
  })

  it('POST /api/v1/payments/subscription/auto-renew is mounted (401, not 404, without auth)', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/v1/payments/subscription/auto-renew')
      .send({ enabled: true })

    expect(res.status).toBe(401)
  })
})
