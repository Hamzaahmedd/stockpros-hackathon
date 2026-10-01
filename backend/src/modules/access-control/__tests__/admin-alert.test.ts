const mockEnqueue = jest.fn()
jest.mock('../../notifications/public', () => ({
  enqueueAdminActionAlertEmail: (...args: unknown[]) => mockEnqueue(...args),
}))

const mockLogger = { info: jest.fn(), warn: jest.fn() }
jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: mockLogger,
}))

import config from '@/config'
import { AdminAuditAction } from '@prisma/client'
import {
  alertAdminAction,
  RISKY_ADMIN_ACTIONS,
  STEP_UP_LOCKOUT_ALERT,
} from '../admin-alert'
import { AdminTargetType } from '../admin-audit'

const admin = config.admin as {
  alertEmails: string[]
  alertCreditThresholdPaisa: number
}
const original = { ...admin }

beforeEach(() => {
  jest.clearAllMocks()
  admin.alertEmails = ['security@venturedive.com']
  admin.alertCreditThresholdPaisa = 5_000_000
  mockEnqueue.mockResolvedValue(undefined)
})
afterEach(() => {
  Object.assign(admin, original)
})

const event = (overrides = {}) => ({
  adminId: 'staff-1',
  action: AdminAuditAction.PLAN_OVERRIDE,
  targetType: AdminTargetType.USER,
  targetId: 'user-9',
  ticketRef: 'SUP-77',
  ...overrides,
})

describe('which actions alert', () => {
  it.each([
    AdminAuditAction.PLAN_OVERRIDE,
    AdminAuditAction.USER_SESSION_INVALIDATED,
    AdminAuditAction.EMERGENCY_MARKET_TOGGLED,
    AdminAuditAction.MEMBER_FORCE_REMOVED,
    STEP_UP_LOCKOUT_ALERT,
  ])('%s is risky', async (action) => {
    expect(RISKY_ADMIN_ACTIONS.has(action)).toBe(true)
    await alertAdminAction(event({ action }))
    expect(mockEnqueue).toHaveBeenCalledTimes(1)
  })

  it.each([
    AdminAuditAction.DOMAIN_FORCE_VERIFIED,
    AdminAuditAction.SEAT_CAPACITY_OVERRIDE,
    AdminAuditAction.SUBSCRIPTION_EXTENDED,
    AdminAuditAction.CUSTOMER_DATA_REVEALED,
    AdminAuditAction.WEBHOOK_RETRIED,
  ])('%s does not', async (action) => {
    await alertAdminAction(event({ action }))
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  describe('credit adjustments', () => {
    const adjust = (amountPaisa?: number) =>
      alertAdminAction(
        event({ action: AdminAuditAction.CREDIT_INJECTION, amountPaisa }),
      )

    it('alert at or above the threshold, in either direction', async () => {
      await adjust(5_000_000)
      await adjust(-5_000_000)
      expect(mockEnqueue).toHaveBeenCalledTimes(2)
    })

    it('stay quiet below it, or with no amount', async () => {
      await adjust(4_999_999)
      await adjust(-100)
      await adjust(undefined)
      expect(mockEnqueue).not.toHaveBeenCalled()
    })

    it('follow a changed threshold', async () => {
      admin.alertCreditThresholdPaisa = 1_000
      await adjust(1_000)
      expect(mockEnqueue).toHaveBeenCalledTimes(1)
    })
  })
})

describe('delivery', () => {
  it('sends nothing when no recipients are configured', async () => {
    admin.alertEmails = []
    await alertAdminAction(event())
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('sends one job per recipient with identifiers only', async () => {
    admin.alertEmails = ['a@venturedive.com', 'b@venturedive.com']
    await alertAdminAction(event())

    expect(mockEnqueue).toHaveBeenCalledTimes(2)
    expect(mockEnqueue.mock.calls.map((call) => call[0].to)).toEqual([
      'a@venturedive.com',
      'b@venturedive.com',
    ])
    expect(mockEnqueue.mock.calls[0][0]).toEqual({
      to: 'a@venturedive.com',
      action: 'PLAN_OVERRIDE',
      adminId: 'staff-1',
      targetType: 'USER',
      targetId: 'user-9',
      ticketRef: 'SUP-77',
      at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    })
  })

  it('logs counts, never the recipients', async () => {
    await alertAdminAction(event())
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[Admin] risky action alert queued',
      { action: 'PLAN_OVERRIDE', recipients: 1 },
    )
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain(
      'security@venturedive.com',
    )
  })

  it('swallows queue failures so the staff action is never affected', async () => {
    mockEnqueue.mockRejectedValue(new Error('redis down'))
    await expect(alertAdminAction(event())).resolves.toBeUndefined()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not queue a risky action alert'),
    )
  })
})

describe('boot-time validation', () => {
  it('refuses to load when a configured recipient is not an email address', () => {
    jest.isolateModules(() => {
      jest.doMock('@/config', () => ({
        __esModule: true,
        default: {
          admin: {
            alertEmails: ['security-team'],
            alertCreditThresholdPaisa: 1,
          },
        },
      }))
      expect(() => require('../admin-alert')).toThrow()
    })
    jest.dontMock('@/config')
  })
})
