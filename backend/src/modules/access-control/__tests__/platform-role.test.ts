const mockPrisma: any = {
  user: { findUnique: jest.fn() },
  userSession: { updateMany: jest.fn() },
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const mockAuth = jest.fn()
jest.mock('../../auth', () => ({
  authTokenMiddleware: (...args: unknown[]) => mockAuth(...args),
}))

import config from '@/config'
import { PlatformRole } from '@prisma/client'
import {
  FeatureDisabledError,
  ForbiddenError,
  StaffSessionExpiredError,
  UnauthorizedError,
} from '../../../shared/errors'
import {
  ADMIN_READ_REASON,
  ADMIN_READ_TARGET_ID,
  AdminTargetType,
  logAdminAction,
  logAdminRead,
} from '../admin-audit'
import { logger } from '../../../shared/infrastructure/logger'
import {
  hasPlatformRole,
  requirePlatformRole,
  requirePricingTiersEnabled,
} from '../platform-role'
import { AdminAuditAction } from '@prisma/client'

const originalFlag = config.features.pricingTiersEnabled
afterEach(() => {
  ;(config.features as any).pricingTiersEnabled = originalFlag
  jest.clearAllMocks()
})

describe('hasPlatformRole', () => {
  it('orders roles and treats missing as USER', () => {
    expect(hasPlatformRole(PlatformRole.SUPER_ADMIN, 'PLATFORM_ADMIN')).toBe(
      true,
    )
    expect(hasPlatformRole(PlatformRole.SUPPORT_AGENT, 'PLATFORM_ADMIN')).toBe(
      false,
    )
    expect(hasPlatformRole(undefined, 'SUPPORT_AGENT')).toBe(false)
    expect(hasPlatformRole(null, 'SUPPORT_AGENT')).toBe(false)
    expect(hasPlatformRole(PlatformRole.USER, 'SUPPORT_AGENT')).toBe(false)
    expect(hasPlatformRole(PlatformRole.SUPPORT_AGENT, 'SUPPORT_AGENT')).toBe(
      true,
    )
  })
})

describe('requirePricingTiersEnabled', () => {
  it('rejects with FeatureDisabledError when tiers are off', () => {
    ;(config.features as any).pricingTiersEnabled = false
    const next = jest.fn()
    requirePricingTiersEnabled({} as any, {} as any, next)
    expect(next.mock.calls[0][0]).toBeInstanceOf(FeatureDisabledError)
    expect(next.mock.calls[0][0].code).toBe('FORBIDDEN_FEATURE_DISABLED')
  })

  it('passes when tiers are on', () => {
    ;(config.features as any).pricingTiersEnabled = true
    const next = jest.fn()
    requirePricingTiersEnabled({} as any, {} as any, next)
    expect(next).toHaveBeenCalledWith()
  })
})

describe('requirePlatformRole chain', () => {
  const roleCheck = requirePlatformRole(PlatformRole.PLATFORM_ADMIN)[2] as any

  it('has gate -> auth -> role stages', () => {
    expect(requirePlatformRole(PlatformRole.SUPPORT_AGENT)).toHaveLength(3)
  })

  it('401s when no authenticated user is on the request', async () => {
    const next = jest.fn()
    await roleCheck({}, {}, next)
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError)
  })

  it('403s a user below the required role, allows one at or above', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      platformRole: PlatformRole.SUPPORT_AGENT,
    })
    const denied = jest.fn()
    await roleCheck({ user: { userId: 'u1' } }, {}, denied)
    expect(denied.mock.calls[0][0]).toBeInstanceOf(ForbiddenError)

    mockPrisma.user.findUnique.mockResolvedValueOnce({
      platformRole: PlatformRole.SUPER_ADMIN,
    })
    const allowed = jest.fn()
    await roleCheck({ user: { userId: 'u1' } }, {}, allowed)
    expect(allowed).toHaveBeenCalledWith()
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { platformRole: true },
    })
  })
})

describe('logAdminAction', () => {
  it('writes one row and scrubs emails/phones from the reason', async () => {
    const client: any = { adminAuditLog: { create: jest.fn() } }

    await logAdminAction(client, {
      adminId: 'a1',
      action: AdminAuditAction.PLAN_OVERRIDE,
      targetType: AdminTargetType.USER,
      targetId: 'u1',
      reason: 'Per ticket from jane@example.com +923001234567',
      ipAddress: '10.0.0.1',
      metadata: { toPlan: 'PRO' },
    })

    expect(client.adminAuditLog.create).toHaveBeenCalledTimes(1)
    expect(client.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminId: 'a1',
        action: 'PLAN_OVERRIDE',
        targetType: 'USER',
        targetId: 'u1',
        reason: 'Per ticket from [redacted-email] [redacted-phone]',
        metadata: { toPlan: 'PRO' },
        ipAddress: '10.0.0.1',
      },
    })
  })
})

describe('structured logging', () => {
  it('logs identifiers only — never the reason, IP or metadata', async () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined)
    const client: any = { adminAuditLog: { create: jest.fn() } }

    await logAdminAction(client, {
      adminId: 'a1',
      action: AdminAuditAction.PLAN_OVERRIDE,
      targetType: AdminTargetType.USER,
      targetId: 'u1',
      reason: 'Ticket from jane@example.com',
      ipAddress: '10.0.0.1',
      metadata: { toPlan: 'PRO' },
    })

    expect(info).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith('[Admin] action recorded', {
      adminId: 'a1',
      action: 'PLAN_OVERRIDE',
      targetType: 'USER',
      targetId: 'u1',
    })
    info.mockRestore()
  })
})

describe('logAdminRead', () => {
  it('records which records were viewed, not what was searched', async () => {
    const client: any = { adminAuditLog: { create: jest.fn() } }
    const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`)

    await logAdminRead(client, {
      adminId: 'a1',
      targetType: AdminTargetType.USER,
      resultIds: ids,
      filterKeys: ['userId'],
      ipAddress: '10.0.0.1',
    })

    expect(client.adminAuditLog.create).toHaveBeenCalledTimes(1)
    const { data } = client.adminAuditLog.create.mock.calls[0][0]
    expect(data).toMatchObject({
      adminId: 'a1',
      action: 'CUSTOMER_DATA_VIEWED',
      targetType: 'USER',
      targetId: ADMIN_READ_TARGET_ID,
      reason: ADMIN_READ_REASON,
      ipAddress: '10.0.0.1',
    })
    expect(data.metadata.resultCount).toBe(150)
    expect(data.metadata.resultIds).toHaveLength(100)
    expect(data.metadata.filterKeys).toEqual(['userId'])
  })

  it('defaults to no filter keys', async () => {
    const client: any = { adminAuditLog: { create: jest.fn() } }
    await logAdminRead(client, {
      adminId: 'a1',
      targetType: AdminTargetType.TEAM,
      resultIds: [],
    })
    expect(client.adminAuditLog.create.mock.calls[0][0].data.metadata).toEqual({
      resultCount: 0,
      resultIds: [],
      filterKeys: [],
    })
  })
})

describe('staff session age limit', () => {
  const HOUR = 60 * 60 * 1000
  const admin = config.admin as { sessionMaxAgeHours: number }
  const original = admin.sessionMaxAgeHours
  const roleCheck = requirePlatformRole(PlatformRole.SUPPORT_AGENT)[2] as any

  const run = async (user: object) => {
    const next = jest.fn()
    await roleCheck({ user }, {}, next)
    return next.mock.calls[0][0]
  }
  const startedAgo = (hours: number) => new Date(Date.now() - hours * HOUR)

  beforeEach(() => {
    admin.sessionMaxAgeHours = 12
    mockPrisma.user.findUnique.mockResolvedValue({
      platformRole: PlatformRole.SUPPORT_AGENT,
    })
    mockPrisma.userSession.updateMany.mockResolvedValue({ count: 1 })
  })
  afterEach(() => {
    admin.sessionMaxAgeHours = original
  })

  it('lets a staff session inside the limit through', async () => {
    const error = await run({
      userId: 'u1',
      sessionId: 's1',
      sessionCreatedAt: startedAgo(11),
    })
    expect(error).toBeUndefined()
    expect(mockPrisma.userSession.updateMany).not.toHaveBeenCalled()
  })

  it('revokes a staff session past the limit and answers 401 STAFF_SESSION_EXPIRED', async () => {
    const error = await run({
      userId: 'u1',
      sessionId: 's1',
      sessionCreatedAt: startedAgo(13),
    })

    expect(error).toBeInstanceOf(StaffSessionExpiredError)
    expect(error.statusCode).toBe(401)
    expect(error.code).toBe('STAFF_SESSION_EXPIRED')
    expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { isRevoked: true },
    })
  })

  it('treats a legacy token with no session start as expired', async () => {
    const error = await run({ userId: 'u1' })
    expect(error).toBeInstanceOf(StaffSessionExpiredError)
    expect(mockPrisma.userSession.updateMany).not.toHaveBeenCalled()
  })

  it('is off when the limit is 0', async () => {
    admin.sessionMaxAgeHours = 0
    const error = await run({
      userId: 'u1',
      sessionId: 's1',
      sessionCreatedAt: startedAgo(500),
    })
    expect(error).toBeUndefined()
  })

  it('never touches the session of a customer who is not staff', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      platformRole: PlatformRole.USER,
    })
    const error = await run({
      userId: 'u1',
      sessionId: 's1',
      sessionCreatedAt: startedAgo(500),
    })
    expect(error).toBeInstanceOf(ForbiddenError)
    expect(mockPrisma.userSession.updateMany).not.toHaveBeenCalled()
  })
})
