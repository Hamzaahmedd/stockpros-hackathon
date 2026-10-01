/**
 * The staff ops panel has two limiters: reads/anything per IP before
 * authentication, and writes per signed-in staff member.
 */
import express from 'express'
import request from 'supertest'
import { adminRateLimiter, adminWriteLimiter } from '../security'

const buildApp = (limiter: express.RequestHandler) => {
  const app = express()
  app.use((req, _res, next) => {
    const userId = req.header('x-user-id')
    if (userId) (req as { user?: { userId: string } }).user = { userId }
    next()
  })
  app.post('/write', limiter, (_req, res) => {
    res.json({ ok: true })
  })
  return app
}

const hit = (app: express.Express, userId?: string) => {
  const req = request(app).post('/write')
  return userId ? req.set('x-user-id', userId) : req
}

describe('adminWriteLimiter', () => {
  it('caps writes at 20 per minute per staff member', async () => {
    const app = buildApp(adminWriteLimiter)

    for (let i = 0; i < 20; i += 1) {
      expect((await hit(app, 'staff-a')).status).toBe(200)
    }
    const blocked = await hit(app, 'staff-a')
    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual({
      success: false,
      message: 'Too many admin changes. Please slow down.',
    })
  })

  it('counts each staff member separately', async () => {
    const app = buildApp(adminWriteLimiter)
    expect((await hit(app, 'staff-b')).status).toBe(200)
    expect((await hit(app, 'staff-c')).status).toBe(200)
  })

  it('falls back to the IP when no user is attached', async () => {
    const app = buildApp(adminWriteLimiter)
    expect((await hit(app)).status).toBe(200)
  })
})

describe('adminRateLimiter', () => {
  it('caps admin traffic at 120 per minute per IP', async () => {
    const app = buildApp(adminRateLimiter)

    for (let i = 0; i < 120; i += 1) {
      expect((await hit(app)).status).toBe(200)
    }
    const blocked = await hit(app)
    expect(blocked.status).toBe(429)
    expect(blocked.body.message).toBe(
      'Too many admin requests. Please slow down.',
    )
  })
})
