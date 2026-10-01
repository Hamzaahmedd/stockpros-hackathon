/**
 * End to end across auth and admin: a staff "invalidate sessions" must make the
 * very next API call made with that user's access token fail, not just block
 * the next refresh. Uses the real auth middleware, the real access-token
 * verifier and the real admin service; only the database is an in-memory fake.
 */
interface FakeSession {
  id: string
  userId: string
  isRevoked: boolean
  expiresAt: Date
  createdAt: Date
}

const sessions = new Map<string, FakeSession>()

const mockDb: any = {
  userSession: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const session = sessions.get(where.id)
      return session ? { ...session, user: { plan: 'PRO' } } : null
    }),
    updateMany: jest.fn(
      async ({ where }: { where: { userId: string; isRevoked: boolean } }) => {
        let count = 0
        for (const session of sessions.values()) {
          if (
            session.userId === where.userId &&
            session.isRevoked === where.isRevoked
          ) {
            session.isRevoked = true
            count += 1
          }
        }
        return { count }
      },
    ),
  },
  user: {
    findUnique: jest.fn(async () => ({ id: 'victim' })),
  },
  adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
  $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(mockDb)),
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockDb
  },
}))

import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import config from '@/config'
import { errorHandler } from '../../../shared/middlewares/error-handler'
import { authTokenMiddleware } from '../../auth'
import * as Users from '../users-service'

const VICTIM = 'victim'
const STAFF = 'staff-1'

const tokenFor = (userId: string, sid: string) =>
  jwt.sign({ sub: userId, sid }, config.auth.accessTokenSecret, {
    expiresIn: '15m',
  })

const app = express()
app.get('/ping', authTokenMiddleware, (_req, res) => {
  res.json({ ok: true })
})
app.use(errorHandler)

const addSession = (id: string, userId: string) =>
  sessions.set(id, {
    id,
    userId,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date(),
  })

beforeEach(() => {
  sessions.clear()
  jest.clearAllMocks()
})

describe('staff session invalidation takes effect on the next request', () => {
  it('rejects every existing token of the user, and only that user', async () => {
    addSession('s-phone', VICTIM)
    addSession('s-laptop', VICTIM)
    addSession('s-other', 'bystander')
    const phone = tokenFor(VICTIM, 's-phone')
    const laptop = tokenFor(VICTIM, 's-laptop')
    const other = tokenFor('bystander', 's-other')

    for (const token of [phone, laptop, other]) {
      const res = await request(app)
        .get('/ping')
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
    }

    const result = await Users.invalidateSessions(
      { adminId: STAFF, reason: 'Credential stuffing incident INC-204' },
      VICTIM,
    )
    expect(result.revokedSessions).toBe(2)

    for (const token of [phone, laptop]) {
      const res = await request(app)
        .get('/ping')
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(401)
      expect(res.body.message).toBe('Session expired or revoked')
    }

    const unaffected = await request(app)
      .get('/ping')
      .set('Authorization', `Bearer ${other}`)
    expect(unaffected.status).toBe(200)
  })

  it('refuses a token whose sid names a session owned by someone else', async () => {
    addSession('s-victim', VICTIM)
    const res = await request(app)
      .get('/ping')
      .set('Authorization', `Bearer ${tokenFor('attacker', 's-victim')}`)
    expect(res.status).toBe(401)
  })
})
