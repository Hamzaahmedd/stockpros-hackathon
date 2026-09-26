/**
 * Feature-flag-off behavior: with the default test config
 * (`config.features.enablePhoneVerification === false`, see
 * backend/src/config/test.ts), the phone-verification routes must not be
 * registered on the auth router at all, and must be completely unreachable
 * (404, same as any unknown route) rather than merely gated inside a
 * handler.
 *
 * Phone verification used to live in its own module (excluded wholesale
 * from `modules/index.ts`'s `modules` array when the flag was off). It now
 * lives inside the auth module (which is always registered), so the same
 * all-or-nothing gating is applied at route-registration time inside
 * `auth/routes.ts` instead.
 *
 * Mirrors the infrastructure-mocking strategy in
 * src/__tests__/app.integration.test.ts (mock Prisma/Redis/Finnhub only,
 * exercise the real Express app + routing).
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

describe('Phone verification — feature flag off (default test config)', () => {
  it('config.features.enablePhoneVerification is false in the test environment', () => {
    expect(config.features.enablePhoneVerification).toBe(false)
  })

  it('the auth module is still assembled into the module list (it is always on)', () => {
    expect(modules.some((m) => m.name === 'auth')).toBe(true)
  })

  it('POST /api/v1/auth/phone-verification/request is unreachable (404, not 401)', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/v1/auth/phone-verification/request')
      .send({ phoneNumber: '+923001234567' })

    expect(res.status).toBe(404)
  })

  it('POST /api/v1/auth/phone-verification/verify is unreachable (404, not 401)', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/v1/auth/phone-verification/verify')
      .send({ code: '123456' })

    expect(res.status).toBe(404)
  })
})
