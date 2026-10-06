/**
 * Contract for /api/v1/announcements: the feature flag gates every route, the
 * caller's identity always comes from the session (never the request), and
 * bad input is rejected before any service runs. Services are mocked.
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
    req.user = { userId, sessionId: `session-${userId}`, plan: 'FREE' }
    next()
  },
}))

const mockListChangelog = jest.fn()
const mockMarkAllSeen = jest.fn()
const mockRecordAction = jest.fn()
const mockResolveAudience = jest.fn()
jest.mock('../service', () => ({
  StateAction: { SEEN: 'SEEN', DISMISSED: 'DISMISSED' },
  listChangelog: (...args: unknown[]) => mockListChangelog(...args),
  markAllSeen: (...args: unknown[]) => mockMarkAllSeen(...args),
  recordAction: (...args: unknown[]) => mockRecordAction(...args),
  resolveAudience: (...args: unknown[]) => mockResolveAudience(...args),
}))

import config from '@/config'
import express from 'express'
import request from 'supertest'
import { ConflictError, NotFoundError } from '../../../shared/errors'
import { errorHandler } from '../../../shared/middlewares/error-handler'
import router from '../routes'
import { ANNOUNCEMENT_ID, OTHER_USER_ID, USER_ID } from './fixtures'

const app = express()
app.use(express.json())
app.use('/api/v1/announcements', router)
app.use(errorHandler)

const AUDIENCE = { plan: 'PRO', role: 'OWNER' }
const BASE = '/api/v1/announcements'
const setEnabled = (enableAnnouncements: boolean) =>
  Object.assign(config.features, { enableAnnouncements })

beforeEach(() => {
  jest.clearAllMocks()
  setEnabled(true)
  mockResolveAudience.mockResolvedValue(AUDIENCE)
  mockListChangelog.mockResolvedValue({ items: [], total: 0, unreadCount: 0 })
  mockMarkAllSeen.mockResolvedValue(2)
  mockRecordAction.mockResolvedValue(undefined)
})

afterAll(() => setEnabled(true))

describe('feature flag', () => {
  it.each([
    ['get', BASE],
    ['post', `${BASE}/seen`],
    ['post', `${BASE}/${ANNOUNCEMENT_ID}/seen`],
    ['post', `${BASE}/${ANNOUNCEMENT_ID}/dismiss`],
  ] as const)('answers 403 on %s %s while disabled', async (method, url) => {
    setEnabled(false)
    const res = await request(app)[method](url).set('x-user-id', USER_ID)
    expect(res.status).toBe(403)
    expect(res.body.errorCode).toBe('FORBIDDEN_FEATURE_DISABLED')
  })
})

describe('authentication', () => {
  it.each([
    ['get', BASE],
    ['post', `${BASE}/seen`],
    ['post', `${BASE}/${ANNOUNCEMENT_ID}/dismiss`],
  ] as const)('rejects an anonymous %s %s', async (method, url) => {
    const res = await request(app)[method](url)
    expect(res.status).toBe(401)
  })
})

describe('GET /', () => {
  it('returns the caller’s changelog with totals', async () => {
    mockListChangelog.mockResolvedValue({
      items: [{ id: ANNOUNCEMENT_ID }],
      total: 7,
      unreadCount: 3,
    })

    const res = await request(app)
      .get(`${BASE}?limit=5&offset=10`)
      .set('x-user-id', USER_ID)

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([{ id: ANNOUNCEMENT_ID }])
    expect(res.body.total).toBe(7)
    expect(res.body.unreadCount).toBe(3)
    expect(mockResolveAudience).toHaveBeenCalledWith(USER_ID)
    expect(mockListChangelog).toHaveBeenCalledWith(USER_ID, AUDIENCE, {
      limit: 5,
      offset: 10,
    })
  })

  it('applies defaults and rejects out-of-range paging', async () => {
    await request(app).get(BASE).set('x-user-id', USER_ID)
    expect(mockListChangelog).toHaveBeenCalledWith(USER_ID, AUDIENCE, {
      limit: 20,
      offset: 0,
    })

    for (const query of ['limit=0', 'limit=51', 'offset=-1', 'limit=abc']) {
      const res = await request(app)
        .get(`${BASE}?${query}`)
        .set('x-user-id', USER_ID)
      expect(res.status).toBe(400)
    }
  })
})

describe('POST /:id/dismiss and /:id/seen', () => {
  it('records the action for the session user, ignoring any userId in the request', async () => {
    const res = await request(app)
      .post(`${BASE}/${ANNOUNCEMENT_ID}/dismiss?userId=${OTHER_USER_ID}`)
      .set('x-user-id', USER_ID)
      .send({ userId: OTHER_USER_ID })

    expect(res.status).toBe(200)
    expect(mockRecordAction).toHaveBeenCalledWith(
      USER_ID,
      ANNOUNCEMENT_ID,
      'DISMISSED',
    )
  })

  it('records a seen action', async () => {
    const res = await request(app)
      .post(`${BASE}/${ANNOUNCEMENT_ID}/seen`)
      .set('x-user-id', USER_ID)
    expect(res.status).toBe(200)
    expect(mockRecordAction).toHaveBeenCalledWith(
      USER_ID,
      ANNOUNCEMENT_ID,
      'SEEN',
    )
  })

  it('rejects a malformed id before calling the service', async () => {
    const res = await request(app)
      .post(`${BASE}/not-a-uuid/dismiss`)
      .set('x-user-id', USER_ID)
    expect(res.status).toBe(400)
    expect(mockRecordAction).not.toHaveBeenCalled()
  })

  it('maps a missing announcement to 404 and a non-dismissible one to 409', async () => {
    mockRecordAction.mockRejectedValueOnce(new NotFoundError('gone'))
    const missing = await request(app)
      .post(`${BASE}/${ANNOUNCEMENT_ID}/dismiss`)
      .set('x-user-id', USER_ID)
    expect(missing.status).toBe(404)

    mockRecordAction.mockRejectedValueOnce(new ConflictError('sticky'))
    const sticky = await request(app)
      .post(`${BASE}/${ANNOUNCEMENT_ID}/dismiss`)
      .set('x-user-id', USER_ID)
    expect(sticky.status).toBe(409)
  })
})

describe('POST /seen', () => {
  it('marks everything read for the session user and reports the count', async () => {
    const res = await request(app)
      .post(`${BASE}/seen`)
      .set('x-user-id', USER_ID)

    expect(res.status).toBe(200)
    expect(res.body.updated).toBe(2)
    expect(mockMarkAllSeen).toHaveBeenCalledWith(USER_ID, AUDIENCE)
    expect(mockRecordAction).not.toHaveBeenCalled()
  })
})
