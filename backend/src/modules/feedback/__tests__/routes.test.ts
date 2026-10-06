/**
 * Wiring contract for /api/v1/feedback: who may submit, who may triage, that
 * triage does not depend on the tier flag, and that submissions are rate
 * limited per user. Services are mocked.
 */
jest.mock('../../auth', () => ({
  authTokenMiddleware: (
    req: any,
    _res: unknown,
    next: (e?: unknown) => void,
  ) => {
    const userId = req.header('x-user-id')
    if (!userId) {
      const { UnauthorizedError } = require('../../../shared/errors')
      return next(new UnauthorizedError('Access token missing'))
    }
    req.user = { userId, sessionId: `session-${userId}`, plan: 'PRO' }
    next()
  },
}))

// Stand-ins that let a test deny either gate; the real checks have their own tests.
jest.mock('../../access-control', () => {
  const { ForbiddenError } = require('../../../shared/errors')
  return {
    Action: { READ: 'read', WRITE: 'write' },
    Resource: {
      CORE_APP: 'core_app',
      ACCESS_CONTROL: 'access_control',
      ROLE: 'role',
    },
    rbacMiddleware: jest.fn(
      () => (req: any, _res: unknown, next: any) =>
        next(
          req.header('x-deny') === 'core'
            ? new ForbiddenError('no core')
            : undefined,
        ),
    ),
    allRbacMiddleware: jest.fn(
      () => (req: any, _res: unknown, next: any) =>
        next(
          req.header('x-deny') === 'admin'
            ? new ForbiddenError('no admin')
            : undefined,
        ),
    ),
  }
})

const mockSubmit = jest.fn()
const mockList = jest.fn()
const mockUpdate = jest.fn()
jest.mock('../service', () => ({
  submitFeedback: (...args: unknown[]) => mockSubmit(...args),
  listFeedback: (...args: unknown[]) => mockList(...args),
  updateFeedbackStatus: (...args: unknown[]) => mockUpdate(...args),
}))

import config from '@/config'
import express from 'express'
import request from 'supertest'
import { errorHandler } from '../../../shared/middlewares/error-handler'
import { allRbacMiddleware, rbacMiddleware } from '../../access-control'
import router from '../routes'

// Recorded while the router loaded, before any test clears the mocks.
const submitGate = (rbacMiddleware as jest.Mock).mock.calls[0]
const triageGate = (allRbacMiddleware as jest.Mock).mock.calls[0]

const app = express()
app.use(express.json())
app.use('/api/v1/feedback', router)
app.use(errorHandler)

const BASE = '/api/v1/feedback'
const ID = '0191e4a0-0000-7000-8000-000000000001'
const COUNTS = { NEW: 0, READ: 0, ARCHIVED: 0 }

beforeEach(() => {
  jest.clearAllMocks()
  mockSubmit.mockResolvedValue({ id: 'f1' })
  mockList.mockResolvedValue({
    data: [],
    nextCursor: null,
    hasMore: false,
    total: 0,
    counts: COUNTS,
  })
  mockUpdate.mockResolvedValue({ id: ID, status: 'READ', changed: true })
})

describe('gates', () => {
  it('lets a user with CORE_APP write submit, and triage needs ACCESS_CONTROL and ROLE read', () => {
    expect(submitGate).toEqual(['core_app', 'write'])
    expect(triageGate).toEqual([
      { resource: 'access_control', action: 'read' },
      { resource: 'role', action: 'read' },
    ])
  })

  it('does not depend on the tier flag: it works in role-based and tier-based mode', async () => {
    const original = config.features.pricingTiersEnabled
    try {
      for (const flag of [false, true]) {
        ;(config.features as any).pricingTiersEnabled = flag
        const res = await request(app).get(BASE).set('x-user-id', 'admin-1')
        expect(res.status).toBe(200)
      }
    } finally {
      ;(config.features as any).pricingTiersEnabled = original
    }
  })

  it.each([
    ['post', BASE],
    ['get', BASE],
    ['patch', `${BASE}/${ID}/status`],
  ] as const)('rejects an anonymous %s %s', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401)
  })

  it('refuses a submission without CORE_APP, and triage without the admin pair', async () => {
    expect(
      (
        await request(app)
          .post(BASE)
          .set('x-user-id', 'u1')
          .set('x-deny', 'core')
          .send({ message: 'hi' })
      ).status,
    ).toBe(403)
    for (const call of [
      request(app).get(BASE),
      request(app).patch(`${BASE}/${ID}/status`).send({ status: 'READ' }),
    ]) {
      const res = await call.set('x-user-id', 'u1').set('x-deny', 'admin')
      expect(res.status).toBe(403)
    }
    expect(mockSubmit).not.toHaveBeenCalled()
    expect(mockList).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('POST /', () => {
  it('stores feedback with the session plan and answers 201', async () => {
    const res = await request(app)
      .post(BASE)
      .set('x-user-id', 'user-posts-once')
      .send({
        message: 'The chart is blank',
        category: 'BUG',
        metadata: { viewport: { width: 800, height: 600 } },
      })

    expect(res.status).toBe(201)
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-posts-once',
        planTier: 'PRO',
        category: 'BUG',
        clientMetadata: { viewport: { width: 800, height: 600 } },
      }),
    )
  })

  it('refuses a client-supplied plan tier', async () => {
    const res = await request(app)
      .post(BASE)
      .set('x-user-id', 'user-claims-plan')
      .send({ message: 'hi', metadata: { planTier: 'TEAM' } })
    expect(res.status).toBe(400)
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('limits each user to a handful of submissions a minute, independently of others', async () => {
    const limit = config.feedback.submitLimitPerMinute
    const send = (userId: string) =>
      request(app).post(BASE).set('x-user-id', userId).send({ message: 'hi' })

    for (let i = 0; i < limit; i += 1) {
      expect((await send('spammer')).status).toBe(201)
    }
    const blocked = await send('spammer')
    expect(blocked.status).toBe(429)
    expect(blocked.body.message).toMatch(/too quickly/)

    // Someone else is unaffected.
    expect((await send('someone-else')).status).toBe(201)
    expect(mockSubmit).toHaveBeenCalledTimes(limit + 1)
  })
})

describe('GET /', () => {
  it('filters by status and returns the counts', async () => {
    mockList.mockResolvedValue({
      data: [],
      nextCursor: null,
      hasMore: false,
      total: 0,
      counts: { NEW: 4, READ: 1, ARCHIVED: 2 },
    })
    const res = await request(app)
      .get(`${BASE}?status=NEW&limit=5`)
      .set('x-user-id', 'admin-1')

    expect(res.status).toBe(200)
    expect(mockList).toHaveBeenCalledWith({ status: 'NEW', limit: 5 })
    expect(res.body.counts).toEqual({ NEW: 4, READ: 1, ARCHIVED: 2 })
  })

  it('refuses an unknown status', async () => {
    const res = await request(app)
      .get(`${BASE}?status=DONE`)
      .set('x-user-id', 'admin-1')
    expect(res.status).toBe(400)
  })
})

describe('PATCH /:id/status', () => {
  it('marks an entry as the signed-in admin', async () => {
    const res = await request(app)
      .patch(`${BASE}/${ID}/status`)
      .set('x-user-id', 'admin-1')
      .send({ status: 'READ' })

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ status: 'READ', changed: true })
    expect(mockUpdate).toHaveBeenCalledWith('admin-1', ID, 'READ')
  })

  it('refuses a malformed id or status before touching the service', async () => {
    for (const [path, body] of [
      ['/not-a-uuid/status', { status: 'READ' }],
      [`/${ID}/status`, { status: 'DONE' }],
      [`/${ID}/status`, {}],
    ] as const) {
      const res = await request(app)
        .patch(`${BASE}${path}`)
        .set('x-user-id', 'admin-1')
        .send(body)
      expect(res.status).toBe(400)
    }
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
