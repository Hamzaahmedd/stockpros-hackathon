// SSO sign-in through the auth module: the tenant-to-domain binding, the sign-in
// policy, session creation (with the tenant recorded) and SSO onboarding.
jest.mock('../../market/infrastructure/finnhub-stream', () => ({
  finnhubService: {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    getQuote: jest.fn().mockResolvedValue({ c: 100, d: 1 }),
  },
}))

jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    userSession: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    userRole: { create: jest.fn() },
    rbacConfiguration: { findUnique: jest.fn() },
    teamDomain: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}))
jest.mock('../../../shared/infrastructure/config/email', () => ({
  transporter: { sendMail: jest.fn() },
  getLogoSrc: jest.fn().mockReturnValue('cid:logo'),
}))
jest.mock('../../notifications/public', () => ({ enqueueAuthEmail: jest.fn() }))
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest
    .fn()
    .mockImplementation(() => ({ verifyIdToken: jest.fn() })),
}))

import config from '@/config'
import { DomainAuthPolicy, LoginMethod, UserStatus } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { prisma } from '../../../shared/infrastructure/database'
import { completeOnboardingFlow, getLoginOptions, ssoSignIn } from '../service'

const mockPrisma = prisma as unknown as {
  [model: string]: Record<string, jest.Mock>
} & { $transaction: jest.Mock }

const TENANT = 'dom-1'
const EMAIL = 'sam@fund.com'
const IP = '127.0.0.1'
const UA = 'jest'

const user = {
  id: 'user-1',
  email: EMAIL,
  displayName: 'Sam',
  status: UserStatus.ACTIVE,
  phoneVerifiedAt: null,
  userRoles: [{ roleId: 'role-1', role: { name: 'MEMBER' } }],
}

/** Answers the two domain lookups by what they ask for: the SSO binding, or the sign-in policy. */
const domains = (options: {
  sso?: { id: string; teamId: string; domain: string } | null
  policy?: DomainAuthPolicy | null
}) =>
  mockPrisma.teamDomain.findFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => {
      if (where.ssoTenantId !== undefined && !('authPolicy' in where)) {
        // findSsoDomainForEmail and findSsoTenantForEmail both filter by tenant or SSO flags.
        return options.sso === undefined
          ? {
              id: 'dom-1',
              teamId: 'team-1',
              domain: 'fund.com',
              ssoTenantId: TENANT,
            }
          : options.sso && { ...options.sso, ssoTenantId: TENANT }
      }
      return options.policy
        ? {
            domain: 'fund.com',
            authPolicy: options.policy,
            ssoTenantId: TENANT,
          }
        : null
    },
  )

const sessionData = () => mockPrisma.userSession.create.mock.calls[0][0].data

beforeEach(() => {
  jest.resetAllMocks()
  mockPrisma.rbacConfiguration.findUnique.mockResolvedValue({
    defaultRole: { id: 'role-default' },
  })
  mockPrisma.userRole.create.mockResolvedValue({})
  mockPrisma.userSession.create.mockResolvedValue({})
  domains({})
})

describe('ssoSignIn', () => {
  it('opens a session recording SSO and the tenant for an existing user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user)

    const result = await ssoSignIn({ tenantId: TENANT, email: EMAIL }, IP, UA)

    expect(result).toMatchObject({
      requiresOnboarding: false,
      user: { userId: 'user-1', email: EMAIL },
    })
    expect(result.accessToken).toBeTruthy()
    expect(sessionData()).toMatchObject({
      userId: 'user-1',
      loginMethod: LoginMethod.SSO,
      ssoTenantId: TENANT,
      googleHd: null,
    })
  })

  it('puts the session id in the access token so revocation works as for other logins', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user)

    const result = await ssoSignIn({ tenantId: TENANT, email: EMAIL }, IP, UA)

    const claims = jwt.verify(
      result.accessToken as string,
      config.auth.accessTokenSecret,
    ) as { sub: string; sid: string }
    expect(claims.sub).toBe('user-1')
    expect(claims.sid).toBe(sessionData().id)
  })

  it('normalises the asserted email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user)

    await ssoSignIn({ tenantId: TENANT, email: ' Sam@Fund.com ' }, IP, UA)

    expect(mockPrisma.user.findUnique.mock.calls[0][0].where).toEqual({
      email: EMAIL,
    })
  })

  it('gives a first-time user an onboarding token carrying the SSO tenant', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)

    const result = await ssoSignIn({ tenantId: TENANT, email: EMAIL }, IP, UA)

    expect(result).toMatchObject({
      requiresOnboarding: true,
      defaultDisplayName: 'sam',
    })
    const claims = jwt.verify(
      result.onboardingToken as string,
      config.auth.accessTokenSecret,
    ) as Record<string, unknown>
    expect(claims).toMatchObject({
      sub: EMAIL,
      type: 'onboarding',
      method: LoginMethod.SSO,
      sso: TENANT,
    })
    expect(mockPrisma.userSession.create).not.toHaveBeenCalled()
  })

  it.each([
    ['an email outside the tenant’s domain', undefined],
    ['a domain that is not verified, enabled and live', null],
  ])('refuses %s', async (_label, sso) => {
    domains({ sso })

    await expect(
      ssoSignIn({ tenantId: TENANT, email: 'ceo@other.com' }, IP, UA),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.userSession.create).not.toHaveBeenCalled()
  })

  it('refuses an inactive account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...user,
      status: UserStatus.SUSPENDED,
    })

    await expect(
      ssoSignIn({ tenantId: TENANT, email: EMAIL }, IP, UA),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(mockPrisma.userSession.create).not.toHaveBeenCalled()
  })

  it('is accepted under the SAML_SSO policy for the domain’s own tenant', async () => {
    domains({ policy: DomainAuthPolicy.SAML_SSO })
    mockPrisma.user.findUnique.mockResolvedValue(user)

    await expect(
      ssoSignIn({ tenantId: TENANT, email: EMAIL }, IP, UA),
    ).resolves.toMatchObject({ requiresOnboarding: false })
  })

  it('backfills the default role for a user who has none', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ ...user, userRoles: [] })
      .mockResolvedValueOnce(user)

    await ssoSignIn({ tenantId: TENANT, email: EMAIL }, IP, UA)

    expect(mockPrisma.userRole.create).toHaveBeenCalled()
  })
})

describe('SSO onboarding', () => {
  const token = (claims: Record<string, unknown>) =>
    jwt.sign(
      { sub: EMAIL, type: 'onboarding', ...claims },
      config.auth.accessTokenSecret,
      { expiresIn: '15m' },
    )

  beforeEach(() => {
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) =>
        fn({
          user: {
            create: jest.fn().mockResolvedValue({ id: 'user-1' }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(user),
          },
          userRole: { create: jest.fn().mockResolvedValue({}) },
          rbacConfiguration: mockPrisma.rbacConfiguration,
        }),
    )
  })

  const finish = (claims: Record<string, unknown>) =>
    completeOnboardingFlow({
      onboardingToken: token(claims),
      displayName: 'Sam',
      ip: IP,
      userAgent: UA,
    })

  it('creates the account and records SSO with its tenant', async () => {
    await finish({ method: LoginMethod.SSO, sso: TENANT })

    expect(sessionData()).toMatchObject({
      loginMethod: LoginMethod.SSO,
      ssoTenantId: TENANT,
    })
  })

  it('refuses when the domain no longer allows this SSO tenant', async () => {
    domains({ sso: null })

    await expect(
      finish({ method: LoginMethod.SSO, sso: TENANT }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('treats an SSO token with no tenant as a magic-link one', async () => {
    domains({ policy: DomainAuthPolicy.SAML_SSO })

    await expect(finish({ method: LoginMethod.SSO })).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('getLoginOptions with SSO', () => {
  it('reports SSO as available when the domain has it enabled', async () => {
    await expect(getLoginOptions(EMAIL)).resolves.toEqual({
      authPolicy: DomainAuthPolicy.ANY,
      ssoAvailable: true,
    })
  })

  it('reports the enforced SSO policy', async () => {
    domains({ policy: DomainAuthPolicy.SAML_SSO })

    await expect(getLoginOptions(EMAIL)).resolves.toEqual({
      authPolicy: DomainAuthPolicy.SAML_SSO,
      ssoAvailable: true,
    })
  })

  it('reports SSO as unavailable when the domain has none', async () => {
    domains({ sso: null })

    await expect(getLoginOptions(EMAIL)).resolves.toMatchObject({
      ssoAvailable: false,
    })
  })
})
