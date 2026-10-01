import { UserStatus } from '@prisma/client'
import jwt from 'jsonwebtoken'
import config from '@/config'

// service.ts transitively imports notifications/public -> ... -> alert-evaluator
// -> socket-server -> finnhub-stream, whose module-level singleton opens a real
// WebSocket connection on import. Mock it so this unit test never touches the
// network (matches the same mock already used in service.test.ts).
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
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    userSession: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    userRole: {
      create: jest.fn(),
    },
    rbacConfiguration: {
      findUnique: jest.fn(),
    },
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

import { prisma } from '../../../shared/infrastructure/database'
import { transporter } from '../../../shared/infrastructure/config/email'
import { enqueueAuthEmail } from '../../notifications/public'
import { OAuth2Client } from 'google-auth-library'
import {
  completeOnboarding,
  completeOnboardingFlow,
  deleteAccount,
  fetchMe,
  generateMagicLink,
  generateTokens,
  googleLogin,
  logoutUser,
  resolveFrontendUrl,
  setMyPlan,
  verifyMagicLink,
} from '../service'

const mockPrisma = prisma as unknown as {
  [model: string]: Record<string, jest.Mock>
} & { $transaction: jest.Mock }

const mockVerifyIdToken = ((OAuth2Client as unknown as jest.Mock).mock
  .results[0]?.value?.verifyIdToken ??
  new (OAuth2Client as unknown as new () => { verifyIdToken: jest.Mock })()
    .verifyIdToken) as jest.Mock

const defaultRole = { id: 'role-default', name: 'MEMBER' }

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.rbacConfiguration.findUnique.mockResolvedValue({
    defaultRole,
  })
  mockPrisma.userRole.create.mockResolvedValue({})
  mockPrisma.userSession.create.mockResolvedValue({})
  ;(transporter.sendMail as jest.Mock).mockResolvedValue(undefined)
  ;(enqueueAuthEmail as jest.Mock).mockResolvedValue(true)
})

/** The session row created at login must be the one the access token points at. */
const expectSessionBoundTo = (accessToken: string | null) => {
  const { sid } = jwt.decode(accessToken as string) as { sid: string }
  expect(sid).toEqual(expect.any(String))
  expect(mockPrisma.userSession.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ id: sid }),
  })
}

describe('generateTokens', () => {
  it('issues an access token, a refresh token, and the refresh jti used to sign it', async () => {
    const result = await generateTokens('user-1', 'session-1')
    expect(result.accessToken).toEqual(expect.any(String))
    expect(result.refreshToken).toEqual(expect.any(String))
    const decoded = jwt.decode(result.refreshToken) as {
      sub: string
      jti: string
    }
    expect(decoded.sub).toBe('user-1')
    expect(decoded.jti).toBe(result.jti)
  })

  it('binds the access token to the session through a stable sid claim', async () => {
    const result = await generateTokens('user-1', 'session-1')
    const access = jwt.decode(result.accessToken) as {
      sub: string
      sid: string
      jti?: string
    }
    expect(access.sub).toBe('user-1')
    expect(access.sid).toBe('session-1')
    // The rotating refresh jti must never leak into the access token.
    expect(access.jti).toBeUndefined()
  })
})

describe('logoutUser', () => {
  it('returns null without touching the database when no refresh token is given', async () => {
    expect(await logoutUser(undefined)).toBeNull()
    expect(mockPrisma.userSession.deleteMany).not.toHaveBeenCalled()
  })

  it('returns null when the token cannot be decoded', async () => {
    expect(await logoutUser('not-a-jwt')).toBeNull()
  })

  it('deletes the session and returns the owning user, matching by hashed or raw jti', async () => {
    const token = jwt.sign({ jti: 'jti-1' }, 'irrelevant-secret')
    mockPrisma.userSession.findUnique.mockResolvedValueOnce({
      userId: 'user-1',
    })
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' })

    const result = await logoutUser(token)

    expect(result).toEqual({ id: 'user-1' })
    expect(mockPrisma.userSession.deleteMany).toHaveBeenCalled()
  })

  it('returns null when no matching session exists, but still attempts the delete', async () => {
    const token = jwt.sign({ jti: 'jti-missing' }, 'irrelevant-secret')
    mockPrisma.userSession.findUnique.mockResolvedValue(null)

    expect(await logoutUser(token)).toBeNull()
    expect(mockPrisma.userSession.deleteMany).toHaveBeenCalled()
  })

  it('swallows an unexpected error during logout and returns null', async () => {
    const token = jwt.sign({ jti: 'jti-1' }, 'irrelevant-secret')
    mockPrisma.userSession.findUnique.mockRejectedValue(new Error('db down'))
    expect(await logoutUser(token)).toBeNull()
  })
})

describe('deleteAccount', () => {
  it('throws NotFoundError when the user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    await expect(deleteAccount('missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('rejects deleting an already-deleted account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      status: UserStatus.DELETED,
    })
    await expect(deleteAccount('user-1')).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})

describe('fetchMe', () => {
  it('throws NotFoundError when the user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    await expect(fetchMe('missing')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns the profile shape for an existing user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      displayName: 'Ada',
      phoneVerifiedAt: null,
      plan: 'FREE',
      userRoles: [],
    })

    const result = await fetchMe('user-1')
    expect(result).toEqual({
      userId: 'user-1',
      email: 'a@example.com',
      displayName: 'Ada',
      phoneVerifiedAt: null,
      userRoles: [],
      plan: 'FREE',
    })
  })
})

describe('setMyPlan', () => {
  it("updates and returns the user's plan", async () => {
    mockPrisma.user.update.mockResolvedValue({ plan: 'PRO' })
    expect(await setMyPlan('user-1', 'PRO' as any)).toBe('PRO')
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { plan: 'PRO' },
      select: { plan: true },
    })
  })
})

describe('resolveFrontendUrl', () => {
  const originalNodeEnv = config.server.nodeEnv
  const originalFrontendUrl = config.server.frontendUrl

  afterEach(() => {
    ;(config.server as any).nodeEnv = originalNodeEnv
    ;(config.server as any).frontendUrl = originalFrontendUrl
  })

  it('uses the configured frontend URL in production, ignoring clientOrigin', () => {
    ;(config.server as any).nodeEnv = 'production'
    ;(config.server as any).frontendUrl = 'https://app.stockpros.example'
    expect(resolveFrontendUrl('https://evil.example')).toBe(
      'https://app.stockpros.example',
    )
  })

  it('throws in production when no frontend URL is configured', () => {
    ;(config.server as any).nodeEnv = 'production'
    ;(config.server as any).frontendUrl = ''
    expect(() => resolveFrontendUrl()).toThrow(
      'FRONTEND_URL must be configured in production to generate magic links',
    )
  })

  it('prefers clientOrigin outside production, then config, then localhost', () => {
    ;(config.server as any).nodeEnv = 'development'
    ;(config.server as any).frontendUrl = 'https://dev.stockpros.example'
    expect(resolveFrontendUrl('https://client.example')).toBe(
      'https://client.example',
    )
    expect(resolveFrontendUrl()).toBe('https://dev.stockpros.example')
    ;(config.server as any).frontendUrl = ''
    expect(resolveFrontendUrl()).toBe('http://localhost:5173')
  })
})

describe('generateMagicLink', () => {
  const originalNodeEnv = config.server.nodeEnv
  afterEach(() => {
    ;(config.server as any).nodeEnv = originalNodeEnv
  })

  it('sends the login link directly via SMTP outside production', async () => {
    ;(config.server as any).nodeEnv = 'development'
    await generateMagicLink('User@Example.com')
    expect(mockPrisma.magicLinkToken.create).toHaveBeenCalled()
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com' }),
    )
    expect(enqueueAuthEmail).not.toHaveBeenCalled()
  })

  it('enqueues delivery instead of sending directly in production', async () => {
    ;(config.server as any).nodeEnv = 'production'
    await generateMagicLink('user@example.com')
    expect(enqueueAuthEmail).toHaveBeenCalled()
    expect(transporter.sendMail).not.toHaveBeenCalled()
  })

  it('falls back to a direct send in production when the queue is unavailable', async () => {
    ;(config.server as any).nodeEnv = 'production'
    ;(enqueueAuthEmail as jest.Mock).mockResolvedValue(false)
    await generateMagicLink('user@example.com')
    expect(transporter.sendMail).toHaveBeenCalled()
  })

  it('swallows an SMTP failure outside production (console fallback)', async () => {
    ;(config.server as any).nodeEnv = 'development'
    ;(transporter.sendMail as jest.Mock).mockRejectedValue(
      new Error('smtp down'),
    )
    await expect(generateMagicLink('user@example.com')).resolves.toBeUndefined()
  })

  it('rethrows an SMTP failure in production once the queue has already been bypassed', async () => {
    ;(config.server as any).nodeEnv = 'production'
    ;(enqueueAuthEmail as jest.Mock).mockResolvedValue(false)
    ;(transporter.sendMail as jest.Mock).mockRejectedValue(
      new Error('smtp down'),
    )
    await expect(generateMagicLink('user@example.com')).rejects.toThrow(
      'smtp down',
    )
  })
})

describe('verifyMagicLink', () => {
  const ip = '127.0.0.1'
  const userAgent = 'jest'

  it('rejects an empty or non-string token', async () => {
    await expect(verifyMagicLink('', ip, userAgent)).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('reports an already-used link', async () => {
    mockPrisma.magicLinkToken.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue({ isUsed: true })
    await expect(verifyMagicLink('tok', ip, userAgent)).rejects.toThrow(
      'This login link has already been used',
    )
  })

  it('reports an expired link and deletes the stale record', async () => {
    mockPrisma.magicLinkToken.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue({
      isUsed: false,
      expiresAt: new Date(Date.now() - 1000),
    })
    await expect(verifyMagicLink('tok', ip, userAgent)).rejects.toThrow(
      'This login link has expired',
    )
    expect(mockPrisma.magicLinkToken.deleteMany).toHaveBeenCalled()
  })

  it('reports an invalid link when no record matches at all', async () => {
    mockPrisma.magicLinkToken.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue(null)
    await expect(verifyMagicLink('tok', ip, userAgent)).rejects.toThrow(
      'Invalid or expired login link',
    )
  })

  it('reports the link record missing if it vanishes between the atomic update and the re-read', async () => {
    mockPrisma.magicLinkToken.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue(null)
    await expect(verifyMagicLink('tok', ip, userAgent)).rejects.toThrow(
      'Login link record not found',
    )
  })

  it('issues an onboarding token when no account exists yet for the linked email', async () => {
    mockPrisma.magicLinkToken.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue({
      email: 'new@example.com',
    })
    mockPrisma.user.findUnique.mockResolvedValue(null)

    const result = await verifyMagicLink('tok', ip, userAgent)
    expect(result.requiresOnboarding).toBe(true)
    if (result.requiresOnboarding) {
      expect(result.onboardingToken).toEqual(expect.any(String))
    }
  })

  it('assigns the default role to an existing user who somehow has none, then logs them in', async () => {
    mockPrisma.magicLinkToken.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue({
      email: 'user@example.com',
    })
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'Ada',
        status: UserStatus.ACTIVE,
        phoneVerifiedAt: null,
        userRoles: [],
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'Ada',
        status: UserStatus.ACTIVE,
        phoneVerifiedAt: null,
        userRoles: [{ roleId: 'role-default' }],
      })

    const result = await verifyMagicLink('tok', ip, userAgent)
    expect(mockPrisma.userRole.create).toHaveBeenCalled()
    expect(result.requiresOnboarding).toBe(false)
    if (!result.requiresOnboarding) {
      expect(result.user.roleId).toBe('role-default')
      expect(result.accessToken).toEqual(expect.any(String))
    }
  })

  it('rejects a suspended/inactive account', async () => {
    mockPrisma.magicLinkToken.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue({
      email: 'user@example.com',
    })
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      status: UserStatus.SUSPENDED,
      userRoles: [{ roleId: 'role-1' }],
    })

    await expect(verifyMagicLink('tok', ip, userAgent)).rejects.toThrow(
      'Account is inactive or suspended',
    )
  })

  it('logs an existing active user in, creating a session and deleting the used token', async () => {
    mockPrisma.magicLinkToken.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue({
      email: 'user@example.com',
    })
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      displayName: 'Ada',
      status: UserStatus.ACTIVE,
      phoneVerifiedAt: new Date(),
      userRoles: [{ roleId: 'role-1' }],
    })

    const result = await verifyMagicLink('tok', ip, userAgent)
    expect(result.requiresOnboarding).toBe(false)
    if (!result.requiresOnboarding) {
      expect(result.requiresPhoneVerification).toBe(false)
      expectSessionBoundTo(result.accessToken)
    }
    expect(mockPrisma.userSession.create).toHaveBeenCalled()
    expect(mockPrisma.magicLinkToken.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String) },
    })
  })
})

describe('completeOnboarding', () => {
  it('creates the user and default role in one transaction, then issues a session', async () => {
    const createdUser = {
      id: 'user-1',
      email: 'new@example.com',
      displayName: 'Ada',
      status: UserStatus.ACTIVE,
      phoneVerifiedAt: null,
      userRoles: [{ roleId: 'role-default' }],
    }
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => {
        const tx = {
          user: {
            create: jest.fn().mockResolvedValue({ id: 'user-1' }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(createdUser),
          },
          userRole: { create: jest.fn().mockResolvedValue({}) },
          rbacConfiguration: mockPrisma.rbacConfiguration,
        }
        return fn(tx)
      },
    )

    const result = await completeOnboarding(
      'new@example.com',
      'Ada',
      '127.0.0.1',
      'jest',
    )
    expect(result.user.email).toBe('new@example.com')
    expect(result.accessToken).toEqual(expect.any(String))
    expectSessionBoundTo(result.accessToken)
  })

  it('throws when the system has no default role configured', async () => {
    mockPrisma.rbacConfiguration.findUnique.mockResolvedValue(null)
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => {
        const tx = {
          user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) },
          rbacConfiguration: mockPrisma.rbacConfiguration,
        }
        return fn(tx)
      },
    )

    await expect(
      completeOnboarding('new@example.com', 'Ada', '127.0.0.1', 'jest'),
    ).rejects.toThrow('The default user role is not configured')
  })
})

describe('completeOnboardingFlow', () => {
  it('rejects a blank display name', async () => {
    await expect(
      completeOnboardingFlow({
        displayName: '  ',
        ip: '127.0.0.1',
        userAgent: 'jest',
      }),
    ).rejects.toThrow('Display name is required')
  })

  it('rejects when neither an onboarding token nor an authenticated/body email is available', async () => {
    await expect(
      completeOnboardingFlow({
        displayName: 'Ada',
        ip: '127.0.0.1',
        userAgent: 'jest',
      }),
    ).rejects.toThrow('Onboarding token or authentication is required')
  })

  it('rejects a token that fails signature verification entirely', async () => {
    await expect(
      completeOnboardingFlow({
        onboardingToken: 'garbage',
        displayName: 'Ada',
        ip: '127.0.0.1',
        userAgent: 'jest',
      }),
    ).rejects.toThrow('Invalid or expired onboarding token')
  })

  it('rejects a validly-signed token that is not actually an onboarding token', async () => {
    const nonOnboardingToken = jwt.sign(
      { sub: 'user-1' }, // no type: 'onboarding'
      config.auth.accessTokenSecret,
    )
    await expect(
      completeOnboardingFlow({
        onboardingToken: nonOnboardingToken,
        displayName: 'Ada',
        ip: '127.0.0.1',
        userAgent: 'jest',
      }),
    ).rejects.toThrow('Invalid or expired onboarding token')
  })

  it('signs up a new user from a valid onboarding token', async () => {
    const onboardingToken = jwt.sign(
      { sub: 'new@example.com', type: 'onboarding' },
      config.auth.accessTokenSecret,
    )
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => {
        const tx = {
          user: {
            create: jest.fn().mockResolvedValue({ id: 'user-1' }),
            findUniqueOrThrow: jest.fn().mockResolvedValue({
              id: 'user-1',
              email: 'new@example.com',
              displayName: 'Ada',
              status: UserStatus.ACTIVE,
              phoneVerifiedAt: null,
              userRoles: [{ roleId: 'role-default' }],
            }),
          },
          userRole: { create: jest.fn().mockResolvedValue({}) },
          rbacConfiguration: mockPrisma.rbacConfiguration,
        }
        return fn(tx)
      },
    )

    const result = await completeOnboardingFlow({
      onboardingToken,
      displayName: 'Ada',
      ip: '127.0.0.1',
      userAgent: 'jest',
    })
    expect(result.kind).toBe('signupCompleted')
  })

  it('updates the display name in place for an already-authenticated bearer session', async () => {
    const bearerToken = jwt.sign(
      { sub: 'user-1' },
      config.auth.accessTokenSecret,
    )
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      displayName: 'New Name',
      status: UserStatus.ACTIVE,
      phoneVerifiedAt: null,
      userRoles: [{ roleId: 'role-1' }],
    })

    const result = await completeOnboardingFlow({
      displayName: 'New Name',
      authHeader: `Bearer ${bearerToken}`,
      ip: '127.0.0.1',
      userAgent: 'jest',
    })

    expect(result.kind).toBe('profileUpdated')
    if (result.kind === 'profileUpdated') {
      expect(result.user.displayName).toBe('New Name')
    }
  })

  it('falls back to the body email when the bearer token is invalid', async () => {
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => {
        const tx = {
          user: {
            create: jest.fn().mockResolvedValue({ id: 'user-1' }),
            findUniqueOrThrow: jest.fn().mockResolvedValue({
              id: 'user-1',
              email: 'body@example.com',
              displayName: 'Ada',
              status: UserStatus.ACTIVE,
              phoneVerifiedAt: null,
              userRoles: [{ roleId: 'role-default' }],
            }),
          },
          userRole: { create: jest.fn().mockResolvedValue({}) },
          rbacConfiguration: mockPrisma.rbacConfiguration,
        }
        return fn(tx)
      },
    )

    const result = await completeOnboardingFlow({
      displayName: 'Ada',
      authHeader: 'Bearer not-a-real-token',
      emailFromBody: 'body@example.com',
      ip: '127.0.0.1',
      userAgent: 'jest',
    })
    expect(result.kind).toBe('signupCompleted')
  })
})

describe('googleLogin', () => {
  const ip = '127.0.0.1'
  const userAgent = 'jest'

  it('rejects invalid Google credentials', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('bad token'))
    await expect(googleLogin('bad-id-token', ip, userAgent)).rejects.toThrow(
      'Invalid Google credentials',
    )
  })

  it('rejects an unverified Google email', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'user@example.com', email_verified: false }),
    })
    await expect(googleLogin('id-token', ip, userAgent)).rejects.toThrow(
      'Google account email is not verified',
    )
  })

  it('issues an onboarding token for a first-time Google sign-in, defaulting the display name from the email', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        email: 'NewUser@Example.com',
        email_verified: true,
        name: null,
      }),
    })
    mockPrisma.user.findUnique.mockResolvedValue(null)

    const result = await googleLogin('id-token', ip, userAgent)
    expect(result.requiresOnboarding).toBe(true)
    if (result.requiresOnboarding) {
      expect(result.defaultDisplayName).toBe('newuser')
    }
  })

  it('rejects a suspended/inactive account', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        email: 'user@example.com',
        email_verified: true,
        name: 'Ada',
      }),
    })
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      status: UserStatus.SUSPENDED,
      userRoles: [{ roleId: 'role-1' }],
    })
    await expect(googleLogin('id-token', ip, userAgent)).rejects.toThrow(
      'Account is inactive or suspended',
    )
  })

  it('assigns the default role to an existing Google user who somehow has none, then logs them in', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        email: 'user@example.com',
        email_verified: true,
        name: 'Ada',
      }),
    })
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'Ada',
        status: UserStatus.ACTIVE,
        phoneVerifiedAt: null,
        userRoles: [],
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'Ada',
        status: UserStatus.ACTIVE,
        phoneVerifiedAt: null,
        userRoles: [{ roleId: 'role-default' }],
      })

    const result = await googleLogin('id-token', ip, userAgent)
    expect(mockPrisma.userRole.create).toHaveBeenCalled()
    expect(result.requiresOnboarding).toBe(false)
    if (!result.requiresOnboarding) {
      expect(result.user.roleId).toBe('role-default')
    }
  })

  it('logs an existing active Google user in and issues a session', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        email: 'user@example.com',
        email_verified: true,
        name: 'Ada',
      }),
    })
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      displayName: 'Ada',
      status: UserStatus.ACTIVE,
      phoneVerifiedAt: null,
      userRoles: [{ roleId: 'role-1' }],
    })

    const result = await googleLogin('id-token', ip, userAgent)
    expect(result.requiresOnboarding).toBe(false)
    expectSessionBoundTo(result.accessToken)
  })
})
