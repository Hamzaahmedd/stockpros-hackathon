// Login enforcement across every auth entry point: magic link (request and
// verify), Google (including the Workspace `hd` claim), onboarding, and the
// refresh-time backstop for sessions that outlive a policy change.
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
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    userRole: { create: jest.fn() },
    rbacConfiguration: { findUnique: jest.fn() },
    teamDomain: { findFirst: jest.fn() },
    magicLinkToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('../../../shared/infrastructure/config/email', () => ({
  transporter: { sendMail: jest.fn() },
  getLogoSrc: jest.fn().mockReturnValue('cid:logo'),
}))

jest.mock('../../notifications/public', () => ({
  enqueueAuthEmail: jest.fn(),
}))

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}))

import config from '@/config'
import { DomainAuthPolicy, LoginMethod, UserStatus } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'
import { LoginMethodRequiredError } from '../../../shared/errors'
import { prisma } from '../../../shared/infrastructure/database'
import { hashToken } from '../../../shared/utils'
import {
  completeOnboarding,
  completeOnboardingFlow,
  generateMagicLink,
  getLoginOptions,
  googleLogin,
  refreshAccessToken,
  verifyMagicLink,
} from '../service'

const mockPrisma = prisma as unknown as {
  [model: string]: Record<string, jest.Mock>
} & { $transaction: jest.Mock }

const mockVerifyIdToken = ((OAuth2Client as unknown as jest.Mock).mock
  .results[0]?.value?.verifyIdToken ??
  new (OAuth2Client as unknown as new () => { verifyIdToken: jest.Mock })()
    .verifyIdToken) as jest.Mock

const IP = '127.0.0.1'
const UA = 'jest'
const EMAIL = 'sam@fund.com'

const restrict = (authPolicy: DomainAuthPolicy | null) =>
  mockPrisma.teamDomain.findFirst.mockResolvedValue(
    authPolicy ? { domain: 'fund.com', authPolicy } : null,
  )

const existingUser = {
  id: 'user-1',
  email: EMAIL,
  displayName: 'Sam',
  status: UserStatus.ACTIVE,
  phoneVerifiedAt: null,
  userRoles: [{ roleId: 'role-1', role: { name: 'MEMBER' } }],
}

const googlePayload = (extra: Record<string, unknown> = {}) =>
  mockVerifyIdToken.mockResolvedValue({
    getPayload: () => ({
      email: EMAIL,
      email_verified: true,
      name: 'Sam',
      ...extra,
    }),
  })

const sessionData = () => mockPrisma.userSession.create.mock.calls[0][0].data

beforeEach(() => {
  jest.resetAllMocks()
  mockPrisma.rbacConfiguration.findUnique.mockResolvedValue({
    defaultRole: { id: 'role-default' },
  })
  mockPrisma.userRole.create.mockResolvedValue({})
  mockPrisma.userSession.create.mockResolvedValue({})
  restrict(null)
})

describe('magic link request', () => {
  it.each([DomainAuthPolicy.GOOGLE_ONLY, DomainAuthPolicy.GOOGLE_WORKSPACE])(
    'is refused on a %s domain and sends nothing',
    async (policy) => {
      restrict(policy)

      await expect(generateMagicLink(EMAIL)).rejects.toBeInstanceOf(
        LoginMethodRequiredError,
      )
      expect(mockPrisma.magicLinkToken.create).not.toHaveBeenCalled()
    },
  )

  it('only looks at verified domains of live workspaces', async () => {
    await generateMagicLink(EMAIL).catch(() => undefined)

    expect(mockPrisma.teamDomain.findFirst.mock.calls[0][0].where).toEqual({
      domain: 'fund.com',
      isVerified: true,
      authPolicy: { not: DomainAuthPolicy.ANY },
      team: { status: 'ACTIVE' },
    })
  })

  it('goes ahead when the domain is unrestricted', async () => {
    mockPrisma.magicLinkToken.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.magicLinkToken.create.mockResolvedValue({})
    const { transporter } = jest.requireMock(
      '../../../shared/infrastructure/config/email',
    )
    transporter.sendMail.mockResolvedValue(undefined)

    await expect(generateMagicLink(EMAIL)).resolves.toBeUndefined()
    expect(mockPrisma.magicLinkToken.create).toHaveBeenCalled()
  })
})

describe('magic link verify', () => {
  beforeEach(() => {
    mockPrisma.magicLinkToken.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue({ email: EMAIL })
    mockPrisma.magicLinkToken.deleteMany.mockResolvedValue({ count: 1 })
  })

  it('refuses a link issued before the domain was restricted', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(existingUser)
    restrict(DomainAuthPolicy.GOOGLE_ONLY)

    await expect(verifyMagicLink('raw', IP, UA)).rejects.toBeInstanceOf(
      LoginMethodRequiredError,
    )
    expect(mockPrisma.userSession.create).not.toHaveBeenCalled()
  })

  it('records the magic-link method on the session it creates', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(existingUser)

    await verifyMagicLink('raw', IP, UA)

    expect(sessionData()).toMatchObject({
      loginMethod: LoginMethod.MAGIC_LINK,
      googleHd: null,
    })
  })

  it('stamps the onboarding token of a new user with the magic-link method', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)

    const result = await verifyMagicLink('raw', IP, UA)

    const claims = jwt.decode(result.onboardingToken as string) as {
      method: string
    }
    expect(claims.method).toBe(LoginMethod.MAGIC_LINK)
  })
})

describe('Google login', () => {
  it('lets a GOOGLE_ONLY domain in without a Workspace account', async () => {
    googlePayload()
    mockPrisma.user.findUnique.mockResolvedValue(existingUser)
    restrict(DomainAuthPolicy.GOOGLE_ONLY)

    await googleLogin('id-token', IP, UA)

    expect(sessionData()).toMatchObject({
      loginMethod: LoginMethod.GOOGLE,
      googleHd: null,
    })
  })

  it('lets a GOOGLE_WORKSPACE domain in when hd matches, storing it lower-cased', async () => {
    googlePayload({ hd: 'Fund.com' })
    mockPrisma.user.findUnique.mockResolvedValue(existingUser)
    restrict(DomainAuthPolicy.GOOGLE_WORKSPACE)

    await googleLogin('id-token', IP, UA)

    expect(sessionData()).toMatchObject({
      loginMethod: LoginMethod.GOOGLE,
      googleHd: 'fund.com',
    })
  })

  it.each([
    ['another Workspace domain', { hd: 'other.com' }],
    ['a plain Google account with no hd', {}],
  ])('refuses a GOOGLE_WORKSPACE domain for %s', async (_name, extra) => {
    googlePayload(extra)
    mockPrisma.user.findUnique.mockResolvedValue(existingUser)
    restrict(DomainAuthPolicy.GOOGLE_WORKSPACE)

    await expect(googleLogin('id-token', IP, UA)).rejects.toBeInstanceOf(
      LoginMethodRequiredError,
    )
    expect(mockPrisma.userSession.create).not.toHaveBeenCalled()
  })

  it('stamps a new user’s onboarding token with the Google method and hd', async () => {
    googlePayload({ hd: 'fund.com' })
    mockPrisma.user.findUnique.mockResolvedValue(null)

    const result = await googleLogin('id-token', IP, UA)

    const claims = jwt.decode(result.onboardingToken as string) as {
      method: string
      hd: string
    }
    expect(claims).toMatchObject({ method: LoginMethod.GOOGLE, hd: 'fund.com' })
  })
})

describe('onboarding', () => {
  const onboardingToken = (claims: Record<string, unknown>) =>
    jwt.sign(
      { sub: EMAIL, type: 'onboarding', ...claims },
      config.auth.accessTokenSecret,
      { expiresIn: '15m' },
    )

  const createdUser = {
    id: 'user-1',
    email: EMAIL,
    displayName: 'Sam',
    status: UserStatus.ACTIVE,
    phoneVerifiedAt: null,
    userRoles: [{ roleId: 'role-1', role: { name: 'MEMBER' } }],
  }

  beforeEach(() => {
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) =>
        fn({
          user: {
            create: jest.fn().mockResolvedValue({ id: 'user-1' }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(createdUser),
          },
          userRole: { create: jest.fn().mockResolvedValue({}) },
          rbacConfiguration: mockPrisma.rbacConfiguration,
        }),
    )
  })

  it('refuses to create an account whose proof does not satisfy the domain', async () => {
    restrict(DomainAuthPolicy.GOOGLE_ONLY)

    await expect(
      completeOnboarding(EMAIL, 'Sam', IP, UA, {
        method: LoginMethod.MAGIC_LINK,
      }),
    ).rejects.toBeInstanceOf(LoginMethodRequiredError)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('creates the account and records Google and hd when they satisfy it', async () => {
    restrict(DomainAuthPolicy.GOOGLE_WORKSPACE)

    await completeOnboarding(EMAIL, 'Sam', IP, UA, {
      method: LoginMethod.GOOGLE,
      googleHd: 'fund.com',
    })

    expect(sessionData()).toMatchObject({
      loginMethod: LoginMethod.GOOGLE,
      googleHd: 'fund.com',
    })
  })

  it('reads the method and hd from the onboarding token', async () => {
    restrict(DomainAuthPolicy.GOOGLE_WORKSPACE)

    await completeOnboardingFlow({
      onboardingToken: onboardingToken({
        method: LoginMethod.GOOGLE,
        hd: 'fund.com',
      }),
      displayName: 'Sam',
      ip: IP,
      userAgent: UA,
    })

    expect(sessionData()).toMatchObject({ loginMethod: LoginMethod.GOOGLE })
  })

  it.each([
    ['a token with no method (issued before enforcement)', {}],
    ['a token with an unknown method', { method: 'CARRIER_PIGEON' }],
    ['a magic-link token', { method: LoginMethod.MAGIC_LINK }],
  ])('treats %s as the weakest method', async (_name, claims) => {
    restrict(DomainAuthPolicy.GOOGLE_ONLY)

    await expect(
      completeOnboardingFlow({
        onboardingToken: onboardingToken(claims),
        displayName: 'Sam',
        ip: IP,
        userAgent: UA,
      }),
    ).rejects.toBeInstanceOf(LoginMethodRequiredError)
  })

  it('refuses an unproven email sent in the body on a restricted domain', async () => {
    restrict(DomainAuthPolicy.GOOGLE_ONLY)

    await expect(
      completeOnboardingFlow({
        displayName: 'Sam',
        emailFromBody: EMAIL,
        ip: IP,
        userAgent: UA,
      }),
    ).rejects.toBeInstanceOf(LoginMethodRequiredError)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('still lets an unproven email through on an unrestricted domain', async () => {
    await expect(
      completeOnboardingFlow({
        displayName: 'Sam',
        emailFromBody: EMAIL,
        ip: IP,
        userAgent: UA,
      }),
    ).resolves.toMatchObject({ kind: 'signupCompleted' })
  })
})

describe('refresh backstop', () => {
  const jti = 'old-jti'
  const refreshToken = () =>
    jwt.sign({ sub: 'user-1', jti }, config.auth.refreshTokenSecret, {
      expiresIn: '7d',
    })

  const session = (overrides: Record<string, unknown> = {}) => ({
    id: 'session-1',
    userId: 'user-1',
    jti: hashToken(jti),
    isRevoked: false,
    expiresAt: new Date(Date.now() + 60_000),
    loginMethod: LoginMethod.MAGIC_LINK,
    googleHd: null,
    user: { id: 'user-1', email: EMAIL, status: UserStatus.ACTIVE },
    ...overrides,
  })

  it('revokes a session whose method no longer satisfies the domain and refuses the refresh', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(session())
    restrict(DomainAuthPolicy.GOOGLE_ONLY)

    await expect(refreshAccessToken(refreshToken())).rejects.toThrow(
      'Invalid refresh token',
    )
    expect(mockPrisma.userSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { isRevoked: true },
    })
  })

  it('treats a session from before enforcement (no recorded method) as non-compliant', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(
      session({ loginMethod: null }),
    )
    restrict(DomainAuthPolicy.GOOGLE_ONLY)

    await expect(refreshAccessToken(refreshToken())).rejects.toThrow()
    expect(mockPrisma.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isRevoked: true } }),
    )
  })

  it('refuses a Google session from another Workspace under GOOGLE_WORKSPACE', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(
      session({ loginMethod: LoginMethod.GOOGLE, googleHd: 'other.com' }),
    )
    restrict(DomainAuthPolicy.GOOGLE_WORKSPACE)

    await expect(refreshAccessToken(refreshToken())).rejects.toThrow()
  })

  it('rotates a compliant Google session as before', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(
      session({ loginMethod: LoginMethod.GOOGLE }),
    )
    mockPrisma.userSession.update.mockResolvedValue({})
    restrict(DomainAuthPolicy.GOOGLE_ONLY)

    await expect(refreshAccessToken(refreshToken())).resolves.toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    })
    expect(mockPrisma.userSession.update.mock.calls[0][0].data).not.toEqual({
      isRevoked: true,
    })
  })

  it('also checks the multi-tab grace path', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(null)
    mockPrisma.userSession.findFirst.mockResolvedValue(session())
    restrict(DomainAuthPolicy.GOOGLE_ONLY)

    await expect(refreshAccessToken(refreshToken())).rejects.toThrow()
    expect(mockPrisma.userSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { isRevoked: true },
    })
  })

  it('does not touch sessions of unrestricted domains', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue(session())
    mockPrisma.userSession.update.mockResolvedValue({})

    await refreshAccessToken(refreshToken())

    expect(mockPrisma.userSession.update.mock.calls[0][0].data).not.toEqual({
      isRevoked: true,
    })
  })
})

describe('getLoginOptions', () => {
  it('answers ANY for an unrestricted domain', async () => {
    await expect(getLoginOptions(' Sam@Fund.com ')).resolves.toEqual({
      authPolicy: DomainAuthPolicy.ANY,
    })
    expect(mockPrisma.teamDomain.findFirst.mock.calls[0][0].where.domain).toBe(
      'fund.com',
    )
  })

  it('answers the enforced policy and nothing about the workspace', async () => {
    restrict(DomainAuthPolicy.GOOGLE_WORKSPACE)

    await expect(getLoginOptions(EMAIL)).resolves.toEqual({
      authPolicy: DomainAuthPolicy.GOOGLE_WORKSPACE,
    })
  })
})
