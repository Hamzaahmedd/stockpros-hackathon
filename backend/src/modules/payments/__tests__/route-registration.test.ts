/**
 * Feature-flag-off behavior: with the default test config
 * (`config.features.enablePaymentProcessor === false`, see
 * backend/src/config/test.ts), POST /create-checkout must not be registered
 * at all (404, same as any unknown route) — mirrors
 * auth/phone-verification.route-registration.test.ts.
 *
 * The webhook and verify-tracker routes are always registered regardless of
 * the flag, so a webhook that arrives after a flag flip is still durably
 * recorded rather than silently dropped.
 */

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
import { modules } from '../../index'

describe('Payments — feature flag off (default test config)', () => {
  it('config.features.enablePaymentProcessor is false in the test environment', () => {
    expect(config.features.enablePaymentProcessor).toBe(false)
  })

  it('the payments module is still assembled into the module list (webhook always on)', () => {
    expect(modules.some((m) => m.name === 'payments')).toBe(true)
  })

  it('POST /api/v1/payments/create-checkout is unreachable (404, not 401)', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/v1/payments/create-checkout')
      .send({ plan: 'PRO' })

    expect(res.status).toBe(404)
  })

  it('POST /api/v1/payments/safepay/webhook is reachable (401 for a bad signature, not 404)', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/v1/payments/safepay/webhook')
      .send({ data: { tracker: 'trk_1', state: 'completed' } })

    expect(res.status).toBe(401)
  })

  it('POST /api/v1/payments/verify-tracker is reachable (401 for no auth token, not 404)', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/v1/payments/verify-tracker')
      .send({ trackerId: 'trk_1' })

    expect(res.status).toBe(401)
  })
})
