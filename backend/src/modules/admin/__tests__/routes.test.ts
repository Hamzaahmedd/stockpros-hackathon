/**
 * Tier-gate + RBAC contract for /api/v1/admin/*: every endpoint is dead while
 * pricingTiersEnabled is off, and each role only reaches what it is entitled to.
 * Services are mocked — these tests exercise the middleware chain, validation
 * and the error envelope only.
 */
const mockPrisma: any = {
  user: { findUnique: jest.fn() },
  userSession: { findUnique: jest.fn(), updateMany: jest.fn() },
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

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

// The request volume here would trip the real limiters; they have their own test.
jest.mock('../../../shared/middlewares/security', () => ({
  adminRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  adminWriteLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

jest.mock('../../payments/public', () => ({
  TEAM_MIN_SEATS: 2,
  replayStoredWebhook: jest.fn(),
  getSubscriptionQueues: jest.fn(() => []),
}))
jest.mock('../../notifications/public', () => ({
  getEmailQueue: jest.fn(),
  getAuthEmailQueue: jest.fn(),
}))

const mockResolved = () => jest.fn().mockResolvedValue({ ok: true })
jest.mock('../users-service', () => ({
  searchUsers: mockResolved(),
  overridePlan: mockResolved(),
  invalidateSessions: mockResolved(),
  revealUser: mockResolved(),
}))
jest.mock('../teams-service', () => ({
  searchTeams: mockResolved(),
  setSeatCapacity: mockResolved(),
  forceVerifyDomain: mockResolved(),
  forceRemoveMember: mockResolved(),
}))
jest.mock('../billing-service', () => ({
  listWebhooks: mockResolved(),
  listCreditLedger: mockResolved(),
  retryWebhook: mockResolved(),
  adjustCredits: mockResolved(),
  extendSubscription: mockResolved(),
}))
jest.mock('../step-up-service', () => ({
  requestStepUp: mockResolved(),
  verifyStepUp: mockResolved(),
}))
jest.mock('../timeline-service', () => ({
  getUserTimeline: mockResolved(),
}))
jest.mock('../telemetry-service', () => ({
  getQueueHealth: mockResolved(),
}))
jest.mock('../system-service', () => ({
  getMarketStatus: jest.fn(() => ({ emergencyClosed: false })),
  setMarketEmergency: mockResolved(),
  listAuditLogs: mockResolved(),
}))

import config from '@/config'
import { PlatformRole } from '@prisma/client'
import express from 'express'
import request from 'supertest'
import { errorHandler } from '../../../shared/middlewares/error-handler'
import { PLATFORM_ROLE_RANK } from '../../access-control'
import router from '../routes'

const ID = '0191e4a0-0000-7000-8000-000000000001'
const REASON = 'Customer escalation #4821, approved by finance'

interface Endpoint {
  method: 'get' | 'post' | 'patch' | 'delete'
  path: string
  min: PlatformRole
  body?: object
}

const ENDPOINTS: readonly Endpoint[] = [
  { method: 'get', path: '/users/search?q=ali', min: 'SUPPORT_AGENT' },
  {
    method: 'post',
    path: `/users/${ID}/plan-override`,
    min: 'SUPER_ADMIN',
    body: { plan: 'PRO', reason: REASON },
  },
  {
    method: 'post',
    path: `/users/${ID}/sessions/invalidate`,
    min: 'SUPER_ADMIN',
    body: { reason: REASON },
  },
  { method: 'get', path: '/teams/search?q=acme', min: 'SUPPORT_AGENT' },
  {
    method: 'patch',
    path: `/teams/${ID}/capacity`,
    min: 'PLATFORM_ADMIN',
    body: { seatCapacity: 400, reason: REASON },
  },
  {
    method: 'post',
    path: `/teams/domains/${ID}/verify`,
    min: 'PLATFORM_ADMIN',
    body: { reason: REASON },
  },
  {
    method: 'delete',
    path: `/teams/members/${ID}`,
    min: 'PLATFORM_ADMIN',
    body: { reason: REASON },
  },
  { method: 'get', path: '/billing/webhooks', min: 'SUPPORT_AGENT' },
  {
    method: 'post',
    path: `/billing/webhooks/${ID}/retry`,
    min: 'PLATFORM_ADMIN',
    body: { reason: REASON },
  },
  {
    method: 'post',
    path: '/billing/credits/adjust',
    min: 'PLATFORM_ADMIN',
    body: { target: 'USER', targetId: ID, amountPaisa: 5000, reason: REASON },
  },
  {
    method: 'post',
    path: `/subscriptions/${ID}/extend`,
    min: 'PLATFORM_ADMIN',
    body: { currentPeriodEnd: '2030-01-01T00:00:00.000Z', reason: REASON },
  },
  { method: 'get', path: '/billing/credit-ledger', min: 'SUPPORT_AGENT' },
  { method: 'get', path: '/telemetry/queues', min: 'SUPPORT_AGENT' },
  { method: 'get', path: '/system/market-status', min: 'SUPPORT_AGENT' },
  {
    method: 'post',
    path: '/system/market-emergency',
    min: 'SUPER_ADMIN',
    body: { closed: true, reason: REASON },
  },
  { method: 'get', path: '/system/audit-logs', min: 'SUPPORT_AGENT' },
  {
    method: 'get',
    path: `/users/${ID}/timeline?limit=20`,
    min: 'SUPPORT_AGENT',
  },
  { method: 'post', path: '/step-up/request', min: 'SUPPORT_AGENT', body: {} },
  {
    method: 'post',
    path: '/step-up/verify',
    min: 'SUPPORT_AGENT',
    body: { code: '123456' },
  },
  {
    method: 'post',
    path: `/users/${ID}/reveal`,
    min: 'SUPPORT_AGENT',
    body: { reason: REASON },
  },
]

const app = express()
app.use(express.json())
app.use('/api/v1/admin', router)
app.use(errorHandler)

const call = (endpoint: Endpoint, role?: PlatformRole) => {
  const req = request(app)[endpoint.method](`/api/v1/admin${endpoint.path}`)
  if (role) req.set('x-user-id', role)
  return endpoint.body ? req.send(endpoint.body) : req
}

const originalFlag = config.features.pricingTiersEnabled

beforeEach(() => {
  mockPrisma.user.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => ({
      platformRole: where.id,
    }),
  )
})

afterEach(() => {
  ;(config.features as any).pricingTiersEnabled = originalFlag
})

describe('tier gate (pricingTiersEnabled: false)', () => {
  beforeEach(() => {
    ;(config.features as any).pricingTiersEnabled = false
  })

  it.each(ENDPOINTS)(
    '$method $path is disabled even for SUPER_ADMIN',
    async (endpoint) => {
      const res = await call(endpoint, PlatformRole.SUPER_ADMIN)
      expect(res.status).toBe(403)
      expect(res.body.errorCode).toBe('FORBIDDEN_FEATURE_DISABLED')
    },
  )

  it('also answers 403 to unauthenticated and unknown admin paths', async () => {
    const unauth = await request(app).get('/api/v1/admin/users/search?q=ali')
    expect(unauth.status).toBe(403)
    const unknown = await request(app).get('/api/v1/admin/nope')
    expect(unknown.status).toBe(403)
  })
})

describe('RBAC matrix (pricingTiersEnabled: true)', () => {
  beforeEach(() => {
    ;(config.features as any).pricingTiersEnabled = true
  })

  const roles = Object.values(PlatformRole)

  describe.each(ENDPOINTS)('$method $path', (endpoint) => {
    it.each(roles)('as %s', async (role) => {
      const res = await call(endpoint, role)
      const allowed =
        PLATFORM_ROLE_RANK[role] >= PLATFORM_ROLE_RANK[endpoint.min]
      expect(res.status).toBe(allowed ? 200 : 403)
    })

    it('rejects requests without a token', async () => {
      expect((await call(endpoint)).status).toBe(401)
    })
  })

  it('SUPPORT_AGENT cannot override plans or inject credits, SUPER_ADMIN can', async () => {
    const plan = ENDPOINTS[1]
    const credits = ENDPOINTS[9]
    expect((await call(plan, PlatformRole.SUPPORT_AGENT)).status).toBe(403)
    expect((await call(credits, PlatformRole.SUPPORT_AGENT)).status).toBe(403)
    expect((await call(plan, PlatformRole.SUPER_ADMIN)).status).toBe(200)
    expect((await call(credits, PlatformRole.SUPER_ADMIN)).status).toBe(200)
  })

  it('treats an unknown user row as a plain USER', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const res = await call(ENDPOINTS[0], PlatformRole.SUPER_ADMIN)
    expect(res.status).toBe(403)
  })

  it.each([
    ['missing reason', { plan: 'PRO' }],
    ['short reason', { plan: 'PRO', reason: 'nope' }],
    ['invalid plan', { plan: 'GOLD', reason: REASON }],
  ])('rejects plan override with %s', async (_label, body) => {
    const res = await request(app)
      .post(`/api/v1/admin/users/${ID}/plan-override`)
      .set('x-user-id', PlatformRole.SUPER_ADMIN)
      .send(body)
    expect(res.status).toBe(400)
  })

  it.each([
    ['float amount', { amountPaisa: 10.5 }],
    ['zero amount', { amountPaisa: 0 }],
    ['oversized amount', { amountPaisa: 1_000_000_000 }],
    ['legacy field name', { amount: 500 }],
  ])('rejects credit adjustment with %s', async (_label, patch) => {
    const res = await request(app)
      .post('/api/v1/admin/billing/credits/adjust')
      .set('x-user-id', PlatformRole.PLATFORM_ADMIN)
      .send({ target: 'USER', targetId: ID, reason: REASON, ...patch })
    expect(res.status).toBe(400)
  })

  it('rejects an extension with no dates and a non-uuid id', async () => {
    const noDates = await request(app)
      .post(`/api/v1/admin/subscriptions/${ID}/extend`)
      .set('x-user-id', PlatformRole.PLATFORM_ADMIN)
      .send({ reason: REASON })
    expect(noDates.status).toBe(400)

    const badId = await request(app)
      .post('/api/v1/admin/users/not-a-uuid/sessions/invalidate')
      .set('x-user-id', PlatformRole.SUPER_ADMIN)
      .send({ reason: REASON })
    expect(badId.status).toBe(400)
  })
})

describe('ticketRef over HTTP', () => {
  const originalRequired = config.admin.requireTicketRef
  const setRequired = (value: boolean) => {
    ;(config.admin as { requireTicketRef: boolean }).requireTicketRef = value
  }

  beforeEach(() => {
    ;(config.features as any).pricingTiersEnabled = true
    jest.clearAllMocks()
  })
  afterEach(() => setRequired(originalRequired))

  const overridePlan = (body: object) =>
    request(app)
      .post(`/api/v1/admin/users/${ID}/plan-override`)
      .set('x-user-id', PlatformRole.SUPER_ADMIN)
      .send({ plan: 'PRO', reason: REASON, ...body })

  it('passes the ticket to the service in the write context', async () => {
    setRequired(false)
    const res = await overridePlan({ ticketRef: 'SUP-1234' })
    expect(res.status).toBe(200)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { overridePlan: service } = require('../users-service')
    expect(service).toHaveBeenCalledWith(
      expect.objectContaining({ ticketRef: 'SUP-1234', reason: REASON }),
      ID,
      'PRO',
    )
  })

  it('does not demand a ticket when the switch is off', async () => {
    setRequired(false)
    expect((await overridePlan({})).status).toBe(200)
  })

  it('rejects a missing ticket when the switch is on', async () => {
    setRequired(true)
    const res = await overridePlan({})
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('ticketRef is required')
  })

  it('rejects a malformed ticket whether or not tickets are required', async () => {
    for (const required of [false, true]) {
      setRequired(required)
      const res = await overridePlan({ ticketRef: 'lowercase-1' })
      expect(res.status).toBe(400)
      expect(res.body.message).toContain('ticketRef must look like')
    }
  })
})

describe('step-up gate on writes', () => {
  const admin = config.admin as {
    stepUpEnabled: boolean
    stepUpWindowMinutes: number
  }
  const original = admin.stepUpEnabled

  beforeEach(() => {
    ;(config.features as any).pricingTiersEnabled = true
    admin.stepUpEnabled = true
    mockPrisma.userSession.findUnique.mockReset()
    mockPrisma.userSession.updateMany.mockReset()
    mockPrisma.userSession.updateMany.mockResolvedValue({ count: 1 })
  })
  afterEach(() => {
    admin.stepUpEnabled = original
  })

  const verifiedAgo = (minutes: number) => ({
    stepUpVerifiedAt: new Date(Date.now() - minutes * 60_000),
  })
  const writes = ENDPOINTS.filter(
    (e) => e.method !== 'get' && !e.path.startsWith('/step-up'),
  )
  const reads = ENDPOINTS.filter((e) => e.method === 'get')

  it.each(writes)(
    '$method $path demands step-up when the session has not verified',
    async (endpoint) => {
      mockPrisma.userSession.findUnique.mockResolvedValue({
        stepUpVerifiedAt: null,
      })
      const res = await call(endpoint, PlatformRole.SUPER_ADMIN)
      expect(res.status).toBe(403)
      expect(res.body.errorCode).toBe('STEP_UP_REQUIRED')
    },
  )

  it.each(writes)(
    '$method $path succeeds inside the verification window and extends it',
    async (endpoint) => {
      mockPrisma.userSession.findUnique.mockResolvedValue(verifiedAgo(3))
      const res = await call(endpoint, PlatformRole.SUPER_ADMIN)
      expect(res.status).toBe(200)
      await new Promise((resolve) => setImmediate(resolve))
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-SUPER_ADMIN' },
        data: { stepUpVerifiedAt: expect.any(Date) },
      })
    },
  )

  it('rejects a verification that is older than the window', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(verifiedAgo(16))
    const res = await call(writes[0], PlatformRole.SUPER_ADMIN)
    expect(res.status).toBe(403)
    expect(res.body.errorCode).toBe('STEP_UP_REQUIRED')
  })

  it.each(reads)(
    '$method $path (a read) never needs step-up',
    async (endpoint) => {
      mockPrisma.userSession.findUnique.mockResolvedValue({
        stepUpVerifiedAt: null,
      })
      const res = await call(endpoint, PlatformRole.SUPER_ADMIN)
      expect(res.status).toBe(200)
    },
  )

  it('lets staff reach the step-up endpoints without already being verified', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue({
      stepUpVerifiedAt: null,
    })
    const requestRes = await call(
      ENDPOINTS.find((e) => e.path === '/step-up/request')!,
      PlatformRole.SUPPORT_AGENT,
    )
    expect(requestRes.status).toBe(200)
  })

  it('validates the code format before touching the service', async () => {
    const res = await request(app)
      .post('/api/v1/admin/step-up/verify')
      .set('x-user-id', PlatformRole.SUPPORT_AGENT)
      .send({ code: '12ab56' })
    expect(res.status).toBe(400)
  })

  it('checks the role before step-up, so a support agent is told 403 for the right reason', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue({
      stepUpVerifiedAt: null,
    })
    const res = await call(writes[0], PlatformRole.SUPPORT_AGENT)
    expect(res.status).toBe(403)
    expect(res.body.errorCode).not.toBe('STEP_UP_REQUIRED')
  })
})

describe('staff IP allowlist over HTTP', () => {
  const admin = config.admin as { ipAllowlist: string[] }
  const original = admin.ipAllowlist

  beforeEach(() => {
    ;(config.features as any).pricingTiersEnabled = true
  })
  afterEach(() => {
    admin.ipAllowlist = original
  })

  const search = (role?: PlatformRole) => call(ENDPOINTS[0], role)

  it('does nothing while the list is empty', async () => {
    admin.ipAllowlist = []
    expect((await search(PlatformRole.SUPPORT_AGENT)).status).toBe(200)
  })

  it('admits a listed client even though Node reports it as IPv4-mapped IPv6', async () => {
    admin.ipAllowlist = ['127.0.0.1']
    expect((await search(PlatformRole.SUPPORT_AGENT)).status).toBe(200)
  })

  it('refuses an unlisted client before authentication, with the stable error code', async () => {
    admin.ipAllowlist = ['203.0.113.0/24']
    const res = await search() // no token at all
    expect(res.status).toBe(403)
    expect(res.body.errorCode).toBe('ADMIN_IP_NOT_ALLOWED')
  })

  it('still reports the disabled tier workflow first', async () => {
    admin.ipAllowlist = ['203.0.113.0/24']
    ;(config.features as any).pricingTiersEnabled = false
    const res = await search(PlatformRole.SUPER_ADMIN)
    expect(res.body.errorCode).toBe('FORBIDDEN_FEATURE_DISABLED')
  })
})
