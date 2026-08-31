/**
 * Integration / API Contract Tests — using Supertest against createApp().
 *
 * Strategy (Integration & API Testing pillar):
 * - Tests run against the real Express app assembled by createApp().
 * - We mock ONLY external infrastructure (Prisma, Redis) that requires live
 *   connections — the application routing, middleware chain, and error handler
 *   are all exercised as-is.
 * - Assertions focus on: HTTP status codes, JSON response shape, and headers.
 * - Never spy on internal controller methods or service calls.
 */

// ── Infrastructure mocks ──────────────────────────────────────────────────────
// Prisma: mock at module level so no TCP connection is attempted
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      userSession: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    })),
  }
})

// Redis: cache module gracefully handles no connection (cache disabled in test config)
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

// Finnhub WS: mock to prevent real external connections
jest.mock('../modules/market/infrastructure/finnhub-stream', () => ({
  finnhubService: {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    getQuote: jest
      .fn()
      .mockResolvedValue({
        c: 100,
        d: 1,
        dp: 1,
        h: 101,
        l: 99,
        o: 100,
        pc: 99,
      }),
  },
}))

// ── Test setup ────────────────────────────────────────────────────────────────

import request from 'supertest'
import { createApp } from '../app'

const app = createApp()

// ── Health endpoint ───────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with { status: "ok" } for a shallow health check', async () => {
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok' })
    expect(res.body).toHaveProperty('timestamp')
  })

  it('responds in JSON content-type', async () => {
    const res = await request(app).get('/health')
    expect(res.headers['content-type']).toMatch(/application\/json/)
  })
})

// ── Root endpoint ─────────────────────────────────────────────────────────────

describe('GET /', () => {
  it('returns 200 and a plain-text "running" confirmation', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.text).toMatch(/StockPros server is running/i)
  })
})

// ── Not-Found fallback ────────────────────────────────────────────────────────

describe('Unknown routes', () => {
  it('returns 404 JSON for an undefined GET route', async () => {
    const res = await request(app).get('/this/route/does/not/exist')
    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('message')
  })

  it('returns 404 JSON for an undefined POST route', async () => {
    const res = await request(app).post('/nonexistent')
    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('message')
  })
})

// ── Authentication guard ──────────────────────────────────────────────────────

describe('Auth-protected routes', () => {
  it('GET /api/v1/auth/me without a token returns 401', async () => {
    const res = await request(app).get('/api/v1/auth/me')
    expect(res.status).toBe(401)
    expect(res.body).toHaveProperty('message')
  })

  it('GET /api/v1/auth/me with a malformed Bearer token returns 401', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-real-jwt')

    expect(res.status).toBe(401)
    expect(res.body).toHaveProperty('message')
  })

  it('GET /api/v1/search/symbol-lookup without token returns 401', async () => {
    const res = await request(app).get('/api/v1/search/symbol-lookup?q=AAPL')
    expect(res.status).toBe(401)
  })
})

// ── Security headers (Helmet) ─────────────────────────────────────────────────

describe('Security headers', () => {
  it('includes X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('includes X-Frame-Options header to prevent clickjacking', async () => {
    const res = await request(app).get('/health')
    expect(res.headers['x-frame-options']).toBeTruthy()
  })
})

// ── Request body validation ───────────────────────────────────────────────────

describe('Request body validation', () => {
  it('POST /api/v1/auth/magic-link with no body returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/magic-link')
      .set('Content-Type', 'application/json')
      .send({})

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('message')
  })

  it('POST /api/v1/auth/magic-link with invalid email returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/magic-link')
      .set('Content-Type', 'application/json')
      .send({ email: 'not-an-email' })

    expect(res.status).toBe(400)
  })

  it('POST /api/v1/auth/google with no credential returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/google')
      .set('Content-Type', 'application/json')
      .send({})

    // Should fail validation or google auth — not a 200
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
