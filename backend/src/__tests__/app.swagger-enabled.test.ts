/**
 * Companion to app.integration.test.ts: exercises the other branch of
 * createApp()'s `if (config.features.enableSwaggerDocs)` gate — the default
 * test config has the flag off, so that branch is otherwise never taken.
 */

jest.mock('@/config', () => {
  const actual = jest.requireActual('@/config')
  const patched = {
    ...actual.default,
    features: { ...actual.default.features, enableSwaggerDocs: true },
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

jest.mock('../modules/market/infrastructure/finnhub-stream', () => ({
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
import { createApp } from '../app'

describe('createApp — Swagger docs feature flag on', () => {
  it('config.features.enableSwaggerDocs is true for this suite', () => {
    expect(config.features.enableSwaggerDocs).toBe(true)
  })

  it('still serves /health normally with the flag on (no generated spec present in test env)', async () => {
    const app = createApp()
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
  })
})
