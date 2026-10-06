jest.mock('../../../shared/infrastructure/team-access', () => ({
  // keep the real, pure helpers (roles, permissions); only the DB-backed lookups are faked
  ...jest.requireActual('../../../shared/infrastructure/team-access'),
  getActiveMembership: jest.fn().mockResolvedValue(null),
}))

const mockGetBootAnnouncements = jest.fn()
jest.mock('../../announcements/public', () => ({
  getBootAnnouncements: (...args: unknown[]) =>
    mockGetBootAnnouncements(...args),
}))

jest.mock('../service', () => ({
  completeOnboardingFlow: jest.fn(),
  deleteAccount: jest.fn(),
  fetchMe: jest.fn(),
  generateMagicLink: jest.fn(),
  googleLogin: jest.fn(),
  logoutUser: jest.fn(),
  refreshAccessToken: jest.fn(),
  requestOtp: jest.fn(),
  setMyPlan: jest.fn(),
  verifyMagicLink: jest.fn(),
  verifyOtp: jest.fn(),
}))

import config from '@/config'
import {
  completeOnboardingFlow,
  deleteAccount as deleteAccountService,
  fetchMe,
  generateMagicLink,
  googleLogin as googleLoginService,
  logoutUser,
  refreshAccessToken,
  requestOtp,
  setMyPlan,
  verifyMagicLink,
  verifyOtp,
} from '../service'
import * as controller from '../controller'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.cookie = jest.fn().mockReturnValue(res)
  res.clearCookie = jest.fn().mockReturnValue(res)
  return res
}

const mockReq = (overrides: Record<string, any> = {}) => ({
  user: { userId: 'user-1' },
  body: {},
  cookies: {},
  headers: {},
  get: jest.fn(),
  ...overrides,
})

const next = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  mockGetBootAnnouncements.mockResolvedValue(null)
})

describe('getMyInfo', () => {
  it("returns the caller's profile plus feature flags", async () => {
    ;(fetchMe as jest.Mock).mockResolvedValue({ userId: 'user-1' })
    const req = mockReq()
    const res = mockRes()

    await controller.getMyInfo(req as any, res, next)

    expect(fetchMe).toHaveBeenCalledWith('user-1')
    expect(mockGetBootAnnouncements).toHaveBeenCalledWith(
      'user-1',
      undefined,
      undefined,
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        pricingTiersEnabled: config.features.pricingTiersEnabled,
        user: { userId: 'user-1' },
      }),
    )
  })

  it('merges the announcements slice into the boot payload', async () => {
    const slice = { modal: null, banner: null }
    ;(fetchMe as jest.Mock).mockResolvedValue({
      userId: 'user-1',
      plan: 'PRO',
      workspaceRole: 'ADMIN',
    })
    mockGetBootAnnouncements.mockResolvedValue(slice)
    const res = mockRes()

    await controller.getMyInfo(mockReq() as any, res, next)

    expect(mockGetBootAnnouncements).toHaveBeenCalledWith(
      'user-1',
      'PRO',
      'ADMIN',
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ announcements: slice }),
    )
  })

  it('forwards an unauthenticated request to next()', async () => {
    const req = mockReq({ user: undefined })
    const res = mockRes()
    await controller.getMyInfo(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('updateMyPlan', () => {
  it('updates the plan when the requested value is valid', async () => {
    ;(setMyPlan as jest.Mock).mockResolvedValue('FREE')
    const req = mockReq({ body: { plan: 'FREE' } })
    const res = mockRes()

    await controller.updateMyPlan(req as any, res, next)
    expect(setMyPlan).toHaveBeenCalledWith('user-1', 'FREE')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'FREE' }),
    )
  })

  it('rejects an invalid plan value', async () => {
    const req = mockReq({ body: { plan: 'ENTERPRISE' } })
    const res = mockRes()
    await controller.updateMyPlan(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(setMyPlan).not.toHaveBeenCalled()
  })

  it('blocks a direct upgrade to PRO when the payment processor is enabled', async () => {
    const original = config.features.enablePaymentProcessor
    ;(config.features as any).enablePaymentProcessor = true
    const req = mockReq({ body: { plan: 'PRO' } })
    const res = mockRes()

    await controller.updateMyPlan(req as any, res, next)
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    )
    expect(setMyPlan).not.toHaveBeenCalled()
    ;(config.features as any).enablePaymentProcessor = original
  })

  it('allows a direct upgrade to PRO when the payment processor is disabled (bypass mode)', async () => {
    const original = config.features.enablePaymentProcessor
    ;(config.features as any).enablePaymentProcessor = false
    ;(setMyPlan as jest.Mock).mockResolvedValue('PRO')
    const req = mockReq({ body: { plan: 'PRO' } })
    const res = mockRes()

    await controller.updateMyPlan(req as any, res, next)
    expect(setMyPlan).toHaveBeenCalledWith('user-1', 'PRO')
    ;(config.features as any).enablePaymentProcessor = original
  })
})

describe('refreshToken', () => {
  it('reads the refresh token from the cookie, rotates it, and re-sets the cookie', async () => {
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    })
    const req = mockReq({ cookies: { refresh_token: 'old-refresh' } })
    const res = mockRes()

    await controller.refreshToken(req as any, res, next)

    expect(refreshAccessToken).toHaveBeenCalledWith('old-refresh')
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'new-refresh',
      expect.any(Object),
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'new-access' }),
    )
  })

  it('falls back to a refresh token in the request body when no cookie is present', async () => {
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'b',
    })
    const req = mockReq({ body: { refresh_token: 'body-refresh' } })
    const res = mockRes()

    await controller.refreshToken(req as any, res, next)
    expect(refreshAccessToken).toHaveBeenCalledWith('body-refresh')
  })

  it('rejects when no refresh token is provided anywhere', async () => {
    const req = mockReq()
    const res = mockRes()
    await controller.refreshToken(req as any, res, next)
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 }),
    )
  })
})

describe('logout', () => {
  it('logs the user out and clears the refresh-token cookie', async () => {
    ;(logoutUser as jest.Mock).mockResolvedValue({ id: 'user-1' })
    const req = mockReq({ cookies: { refresh_token: 'tok' } })
    const res = mockRes()

    await controller.logout(req as any, res, next)
    expect(logoutUser).toHaveBeenCalledWith('tok')
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.any(Object),
    )
  })

  it('rejects when no refresh token is provided', async () => {
    const req = mockReq()
    const res = mockRes()
    await controller.logout(req as any, res, next)
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    )
  })
})

describe('deleteAccount', () => {
  it('deletes the account when the confirmation phrase matches exactly', async () => {
    ;(deleteAccountService as jest.Mock).mockResolvedValue(undefined)
    const req = mockReq({ body: { confirmationPhrase: 'DELETE MY ACCOUNT' } })
    const res = mockRes()

    await controller.deleteAccount(req as any, res, next)
    expect(deleteAccountService).toHaveBeenCalledWith('user-1')
    expect(res.clearCookie).toHaveBeenCalled()
  })

  it('rejects a missing or incorrect confirmation phrase', async () => {
    const req = mockReq({ body: { confirmationPhrase: 'delete my account' } })
    const res = mockRes()
    await controller.deleteAccount(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(deleteAccountService).not.toHaveBeenCalled()
  })
})

describe('requestMagicLink', () => {
  it('sends a magic link, resolving clientOrigin from the Origin header', async () => {
    ;(generateMagicLink as jest.Mock).mockResolvedValue(undefined)
    const req = mockReq({
      body: { email: 'user@example.com' },
      get: jest.fn().mockReturnValue('https://app.example.com'),
    })
    const res = mockRes()

    await controller.requestMagicLink(req as any, res, next)
    expect(generateMagicLink).toHaveBeenCalledWith(
      'user@example.com',
      'https://app.example.com',
    )
  })

  it('falls back to the Referer header origin when Origin is absent', async () => {
    ;(generateMagicLink as jest.Mock).mockResolvedValue(undefined)
    const get = jest.fn((header: string) =>
      header === 'referer' ? 'https://app.example.com/login' : undefined,
    )
    const req = mockReq({ body: { email: 'user@example.com' }, get })
    const res = mockRes()

    await controller.requestMagicLink(req as any, res, next)
    expect(generateMagicLink).toHaveBeenCalledWith(
      'user@example.com',
      'https://app.example.com',
    )
  })

  it('passes undefined clientOrigin when neither Origin nor Referer is present', async () => {
    ;(generateMagicLink as jest.Mock).mockResolvedValue(undefined)
    const req = mockReq({ body: { email: 'user@example.com' }, get: jest.fn() })
    const res = mockRes()

    await controller.requestMagicLink(req as any, res, next)
    expect(generateMagicLink).toHaveBeenCalledWith(
      'user@example.com',
      undefined,
    )
  })

  it('rejects an invalid email', async () => {
    const req = mockReq({ body: { email: 'not-an-email' } })
    const res = mockRes()
    await controller.requestMagicLink(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('verifyMagicLinkToken', () => {
  it('returns an onboarding token when the linked account requires onboarding', async () => {
    ;(verifyMagicLink as jest.Mock).mockResolvedValue({
      requiresOnboarding: true,
      onboardingToken: 'ob-tok',
    })
    const req = mockReq({ body: { token: 'raw-tok' } })
    const res = mockRes()

    await controller.verifyMagicLinkToken(req as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresOnboarding: true,
        onboardingToken: 'ob-tok',
      }),
    )
    expect(res.cookie).not.toHaveBeenCalled()
  })

  it('logs an existing user in, setting the refresh-token cookie', async () => {
    ;(verifyMagicLink as jest.Mock).mockResolvedValue({
      requiresOnboarding: false,
      user: { userId: 'user-1' },
      accessToken: 'access',
      refreshToken: 'refresh',
      requiresPhoneVerification: false,
    })
    const req = mockReq({ body: { token: 'raw-tok' } })
    const res = mockRes()

    await controller.verifyMagicLinkToken(req as any, res, next)
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh',
      expect.any(Object),
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'access' }),
    )
  })

  it('rejects a missing token', async () => {
    const req = mockReq({ body: {} })
    const res = mockRes()
    await controller.verifyMagicLinkToken(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('completeOnboardingHandler', () => {
  it('confirms a profile update for an already-authenticated user', async () => {
    ;(completeOnboardingFlow as jest.Mock).mockResolvedValue({
      kind: 'profileUpdated',
      user: { userId: 'user-1' },
      requiresPhoneVerification: false,
    })
    const req = mockReq({ body: { displayName: 'Ada' } })
    const res = mockRes()

    await controller.completeOnboardingHandler(req as any, res, next)
    expect(res.cookie).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Onboarding completed successfully' }),
    )
  })

  it('never forwards an email sent in the body', async () => {
    ;(completeOnboardingFlow as jest.Mock).mockResolvedValue({
      kind: 'profileUpdated',
      user: { userId: 'user-1' },
      requiresPhoneVerification: false,
    })
    const req = mockReq({
      body: { displayName: 'Ada', email: 'victim@example.com' },
    })

    await controller.completeOnboardingHandler(req as any, mockRes(), next)

    const params = (completeOnboardingFlow as jest.Mock).mock.calls.at(-1)[0]
    expect(JSON.stringify(params)).not.toContain('victim@example.com')
  })

  it('issues a session cookie and 201 status for a brand-new signup', async () => {
    ;(completeOnboardingFlow as jest.Mock).mockResolvedValue({
      kind: 'signupCompleted',
      user: { userId: 'user-1' },
      accessToken: 'access',
      refreshToken: 'refresh',
      requiresPhoneVerification: false,
    })
    const req = mockReq({
      body: { displayName: 'Ada', onboardingToken: 'ob-tok' },
    })
    const res = mockRes()

    await controller.completeOnboardingHandler(req as any, res, next)
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh',
      expect.any(Object),
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('rejects a blank display name', async () => {
    const req = mockReq({ body: { displayName: '   ' } })
    const res = mockRes()
    await controller.completeOnboardingHandler(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('googleLogin', () => {
  it('returns onboarding info for a first-time Google sign-in', async () => {
    ;(googleLoginService as jest.Mock).mockResolvedValue({
      requiresOnboarding: true,
      onboardingToken: 'ob-tok',
      defaultDisplayName: 'ada',
    })
    const req = mockReq({ body: { credential: 'id-token' } })
    const res = mockRes()

    await controller.googleLogin(req as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresOnboarding: true,
        defaultDisplayName: 'ada',
      }),
    )
  })

  it('logs an existing Google user in, setting the refresh-token cookie', async () => {
    ;(googleLoginService as jest.Mock).mockResolvedValue({
      requiresOnboarding: false,
      user: { userId: 'user-1' },
      accessToken: 'access',
      refreshToken: 'refresh',
      requiresPhoneVerification: false,
    })
    const req = mockReq({ body: { credential: 'id-token' } })
    const res = mockRes()

    await controller.googleLogin(req as any, res, next)
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh',
      expect.any(Object),
    )
  })

  it('rejects a missing credential', async () => {
    const req = mockReq({ body: {} })
    const res = mockRes()
    await controller.googleLogin(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('requestOtpHandler', () => {
  it("requests a WhatsApp OTP for the caller's phone number", async () => {
    ;(requestOtp as jest.Mock).mockResolvedValue(undefined)
    const req = mockReq({ body: { phoneNumber: '03001234567' } })
    const res = mockRes()

    await controller.requestOtpHandler(req as any, res, next)
    expect(requestOtp).toHaveBeenCalledWith('user-1', '03001234567')
  })

  it('forwards a downstream failure to next()', async () => {
    ;(requestOtp as jest.Mock).mockRejectedValue(new Error('cooldown active'))
    const req = mockReq({ body: { phoneNumber: '03001234567' } })
    const res = mockRes()
    await controller.requestOtpHandler(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('verifyOtpHandler', () => {
  it('verifies the OTP code for the authenticated user', async () => {
    ;(verifyOtp as jest.Mock).mockResolvedValue(undefined)
    const req = mockReq({ body: { code: '123456' } })
    const res = mockRes()

    await controller.verifyOtpHandler(req as any, res, next)
    expect(verifyOtp).toHaveBeenCalledWith('user-1', '123456')
  })

  it('forwards a downstream failure to next()', async () => {
    ;(verifyOtp as jest.Mock).mockRejectedValue(new Error('incorrect code'))
    const req = mockReq({ body: { code: '000000' } })
    const res = mockRes()
    await controller.verifyOtpHandler(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('updateMyPlan — team members', () => {
  it("refuses a plan change for a team member so their plan can't desync from the workspace", async () => {
    const { getActiveMembership } = jest.requireMock(
      '../../../shared/infrastructure/team-access',
    )
    getActiveMembership.mockResolvedValueOnce({ teamId: 'team-1' })
    const req = mockReq({ body: { plan: 'FREE' } })

    await controller.updateMyPlan(req as any, mockRes(), next)

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    )
    expect(setMyPlan).not.toHaveBeenCalled()
  })
})
