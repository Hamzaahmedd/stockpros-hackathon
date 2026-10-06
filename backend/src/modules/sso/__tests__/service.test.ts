const mockProvider = {
  startLogin: jest.fn(),
  completeLogin: jest.fn(),
  upsertConnection: jest.fn(),
  deleteConnection: jest.fn(),
}
const mockDb = {
  user: { findUnique: jest.fn() },
  teamSsoConnection: { update: jest.fn(), updateMany: jest.fn() },
  userSession: { updateMany: jest.fn() },
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock('../../../shared/infrastructure/team-audit', () => ({
  recordTeamAudit: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../../shared/infrastructure/team-access', () => ({
  findSsoDomainForEmail: jest.fn(),
  findSsoTenantForEmail: jest.fn(),
}))
jest.mock('../../auth', () => ({ ssoSignIn: jest.fn() }))
jest.mock('../providers/node-saml', () => ({
  // A plain function, so `resetAllMocks` cannot strip its implementation.
  NodeSamlProvider: function NodeSamlProvider() {
    return mockProvider
  },
}))

import { LoginMethod, TeamAuditAction } from '@prisma/client'
import { BadRequestError, UnauthorizedError } from '../../../shared/errors'
import {
  findSsoDomainForEmail,
  findSsoTenantForEmail,
} from '../../../shared/infrastructure/team-access'
import { recordTeamAudit } from '../../../shared/infrastructure/team-audit'
import { ssoSignIn } from '../../auth'
import { SsoVerificationError } from '../provider'
import {
  exchangeSsoCode,
  handleSsoCallback,
  serviceProviderFor,
  startSsoLogin,
  startSsoTest,
} from '../service'
import {
  createBinding,
  createExchangeCode,
  createFlowState,
  claimResponse,
} from '../state'
import { SsoCallbackOutcome, SsoFlowPurpose } from '../types'

const TENANT = 'dom-1'
const DOMAIN = { id: 'dom-1', teamId: 'team-1', domain: 'fund.com' }
const IDENTITY = {
  tenantId: TENANT,
  email: 'sam@fund.com',
  nameId: 'sam@fund.com',
  requestId: 'req-1',
  attributes: {},
}

beforeEach(() => {
  jest.resetAllMocks()
  ;(recordTeamAudit as jest.Mock).mockResolvedValue(undefined)
  mockProvider.startLogin.mockResolvedValue({
    redirectUrl: 'https://idp.example.com/sso?SAMLRequest=x',
  })
})

describe('serviceProviderFor', () => {
  it('derives the entity id and ACS URL from the tenant id', () => {
    const sp = serviceProviderFor('abc')

    expect(sp.acsUrl).toBe(`${sp.spEntityId}/acs`)
    expect(sp.spEntityId).toMatch(/\/api\/v1\/auth\/sso\/abc$/)
  })
})

describe('startSsoLogin', () => {
  it('sends the browser to the IdP and hands back a binding token', async () => {
    ;(findSsoTenantForEmail as jest.Mock).mockResolvedValue(TENANT)

    const result = await startSsoLogin(' Sam@Fund.com ')

    expect(findSsoTenantForEmail).toHaveBeenCalledWith('sam@fund.com')
    expect(result.redirectUrl).toContain('idp.example.com')
    expect(result.bindingToken.length).toBeGreaterThan(20)
    expect(mockProvider.startLogin).toHaveBeenCalledWith(
      TENANT,
      expect.any(String),
    )
  })

  it('refuses an email whose domain has no SSO', async () => {
    ;(findSsoTenantForEmail as jest.Mock).mockResolvedValue(null)

    await expect(startSsoLogin('sam@gmail.com')).rejects.toBeInstanceOf(
      BadRequestError,
    )
    expect(mockProvider.startLogin).not.toHaveBeenCalled()
  })
})

describe('startSsoTest', () => {
  it('starts a TEST flow for the actor', async () => {
    const result = await startSsoTest({
      tenantId: TENANT,
      actorUserId: 'admin-1',
      actorSessionId: 'sess-1',
    })

    expect(result.redirectUrl).toContain('idp.example.com')
    expect(mockProvider.startLogin).toHaveBeenCalledWith(
      TENANT,
      expect.any(String),
    )
  })
})

/** Starts a flow the way the service does and returns the relay state the IdP would echo. */
const startedFlow = async (
  overrides: Partial<Parameters<typeof createFlowState>[0]> = {},
) =>
  createFlowState({
    tenantId: TENANT,
    purpose: SsoFlowPurpose.LOGIN,
    bindingHash: createBinding().hash,
    ...overrides,
  })

describe('handleSsoCallback', () => {
  const callback = (relayState?: string, tenantId = TENANT) =>
    handleSsoCallback({ tenantId, samlResponse: 'xml', relayState })

  beforeEach(() => {
    mockProvider.completeLogin.mockResolvedValue({
      ...IDENTITY,
      requestId: `req-${Math.random()}`,
    })
    ;(findSsoDomainForEmail as jest.Mock).mockResolvedValue(DOMAIN)
  })

  it('fails without relay state', async () => {
    await expect(callback(undefined)).resolves.toEqual({
      outcome: SsoCallbackOutcome.LOGIN_FAILED,
    })
    expect(mockProvider.completeLogin).not.toHaveBeenCalled()
  })

  it('fails on unknown relay state', async () => {
    await expect(callback('forged')).resolves.toEqual({
      outcome: SsoCallbackOutcome.LOGIN_FAILED,
    })
  })

  it('fails when the state belongs to another tenant', async () => {
    const relay = await startedFlow({ tenantId: 'other-tenant' })

    await expect(callback(relay)).resolves.toEqual({
      outcome: SsoCallbackOutcome.LOGIN_FAILED,
    })
  })

  it('uses the relay state once', async () => {
    const relay = await startedFlow()
    await callback(relay)

    await expect(callback(relay)).resolves.toEqual({
      outcome: SsoCallbackOutcome.LOGIN_FAILED,
    })
  })

  it('turns a rejected assertion into a failed login', async () => {
    mockProvider.completeLogin.mockRejectedValue(
      new SsoVerificationError('bad signature'),
    )

    await expect(callback(await startedFlow())).resolves.toEqual({
      outcome: SsoCallbackOutcome.LOGIN_FAILED,
    })
  })

  it('turns a rejected assertion into a failed test for a TEST flow', async () => {
    mockProvider.completeLogin.mockRejectedValue(
      new SsoVerificationError('bad signature'),
    )

    await expect(
      callback(await startedFlow({ purpose: SsoFlowPurpose.TEST })),
    ).resolves.toEqual({ outcome: SsoCallbackOutcome.TEST_FAILED })
  })

  it('lets genuine server faults through', async () => {
    mockProvider.completeLogin.mockRejectedValue(new Error('db down'))

    await expect(callback(await startedFlow())).rejects.toThrow('db down')
  })

  it('refuses a replayed response', async () => {
    mockProvider.completeLogin.mockResolvedValue({
      ...IDENTITY,
      requestId: 'req-replayed',
    })
    await claimResponse(TENANT, 'req-replayed')

    await expect(callback(await startedFlow())).resolves.toEqual({
      outcome: SsoCallbackOutcome.LOGIN_FAILED,
    })
  })

  it('mints a one-time code for a login on the tenant’s own domain', async () => {
    const result = await callback(await startedFlow())

    expect(result.outcome).toBe(SsoCallbackOutcome.LOGIN_READY)
    expect(result.code).toBeTruthy()
  })

  it('refuses an identity outside the tenant’s domain', async () => {
    ;(findSsoDomainForEmail as jest.Mock).mockResolvedValue(null)

    await expect(callback(await startedFlow())).resolves.toEqual({
      outcome: SsoCallbackOutcome.LOGIN_FAILED,
    })
  })

  it('refuses a login flow that was started without a binding', async () => {
    const relay = await startedFlow({ bindingHash: undefined })

    await expect(callback(relay)).resolves.toEqual({
      outcome: SsoCallbackOutcome.LOGIN_FAILED,
    })
  })

  describe('test flow', () => {
    const testFlow = (overrides = {}) =>
      startedFlow({
        purpose: SsoFlowPurpose.TEST,
        bindingHash: undefined,
        actorUserId: 'admin-1',
        actorSessionId: 'sess-1',
        ...overrides,
      })

    it('marks the connection tested and upgrades the admin’s own session', async () => {
      mockDb.user.findUnique.mockResolvedValue({ email: 'Sam@Fund.com' })
      mockDb.userSession.updateMany.mockResolvedValue({ count: 1 })

      await expect(callback(await testFlow())).resolves.toEqual({
        outcome: SsoCallbackOutcome.TEST_PASSED,
      })

      expect(mockDb.teamSsoConnection.update).toHaveBeenCalledWith({
        where: { domainId: 'dom-1' },
        data: { testedAt: expect.any(Date) },
      })
      expect(mockDb.userSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'sess-1', userId: 'admin-1', isRevoked: false },
        data: { loginMethod: LoginMethod.SSO, ssoTenantId: TENANT },
      })
      expect(recordTeamAudit).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          action: TeamAuditAction.SAML_CONFIG_UPDATED,
          metadata: { domainId: 'dom-1', tested: true, sessionUpgraded: true },
        }),
      )
    })

    it('does not touch the admin’s session when someone else passed the test', async () => {
      mockDb.user.findUnique.mockResolvedValue({ email: 'admin@fund.com' })

      await expect(callback(await testFlow())).resolves.toEqual({
        outcome: SsoCallbackOutcome.TEST_PASSED,
      })

      expect(mockDb.userSession.updateMany).not.toHaveBeenCalled()
      expect(mockDb.teamSsoConnection.update).toHaveBeenCalled()
    })

    it('records that no session was upgraded when it is already gone', async () => {
      mockDb.user.findUnique.mockResolvedValue({ email: 'sam@fund.com' })
      mockDb.userSession.updateMany.mockResolvedValue({ count: 0 })

      await callback(await testFlow())

      expect(recordTeamAudit).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          metadata: expect.objectContaining({ sessionUpgraded: false }),
        }),
      )
    })

    it('does not upgrade a session when the flow named no session', async () => {
      mockDb.user.findUnique.mockResolvedValue({ email: 'sam@fund.com' })

      await callback(await testFlow({ actorSessionId: undefined }))

      expect(mockDb.userSession.updateMany).not.toHaveBeenCalled()
    })

    it('handles a flow with no actor', async () => {
      await expect(
        callback(await testFlow({ actorUserId: undefined })),
      ).resolves.toEqual({ outcome: SsoCallbackOutcome.TEST_PASSED })
      expect(mockDb.user.findUnique).not.toHaveBeenCalled()
    })

    it('fails when the identity is not on the tenant’s domain', async () => {
      ;(findSsoDomainForEmail as jest.Mock).mockResolvedValue(null)

      await expect(callback(await testFlow())).resolves.toEqual({
        outcome: SsoCallbackOutcome.TEST_FAILED,
      })
      expect(mockDb.teamSsoConnection.update).not.toHaveBeenCalled()
    })

    it('checks the domain even while SSO is not yet enabled', async () => {
      await callback(await testFlow())

      expect(findSsoDomainForEmail).toHaveBeenCalledWith(
        TENANT,
        'sam@fund.com',
        { requireEnabled: false },
      )
    })
  })
})

describe('exchangeSsoCode', () => {
  const issue = async (email = 'sam@fund.com') => {
    const binding = createBinding()
    const code = await createExchangeCode({
      tenantId: TENANT,
      email,
      bindingHash: binding.hash,
    })
    return { code, bindingToken: binding.token }
  }

  it('signs the person in and notes the login on the connection', async () => {
    ;(ssoSignIn as jest.Mock).mockResolvedValue({ requiresOnboarding: false })

    const result = await exchangeSsoCode(await issue(), '1.2.3.4', 'agent')

    expect(result).toEqual({ requiresOnboarding: false })
    expect(ssoSignIn).toHaveBeenCalledWith(
      { tenantId: TENANT, email: 'sam@fund.com' },
      '1.2.3.4',
      'agent',
    )
    expect(mockDb.teamSsoConnection.updateMany).toHaveBeenCalledWith({
      where: { domain: { ssoTenantId: TENANT } },
      data: { lastLoginAt: expect.any(Date) },
    })
  })

  it('refuses an unknown or already used code', async () => {
    const issued = await issue()
    ;(ssoSignIn as jest.Mock).mockResolvedValue({})
    await exchangeSsoCode(issued, 'ip', 'ua')

    await expect(exchangeSsoCode(issued, 'ip', 'ua')).rejects.toBeInstanceOf(
      UnauthorizedError,
    )
    await expect(
      exchangeSsoCode({ code: 'missing', bindingToken: 'x' }, 'ip', 'ua'),
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('refuses a code presented without the right binding token', async () => {
    const { code } = await issue()

    await expect(
      exchangeSsoCode({ code, bindingToken: 'attacker-browser' }, 'ip', 'ua'),
    ).rejects.toBeInstanceOf(UnauthorizedError)
    expect(ssoSignIn).not.toHaveBeenCalled()
  })
})
