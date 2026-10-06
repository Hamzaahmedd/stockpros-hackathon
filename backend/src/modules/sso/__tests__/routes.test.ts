const mockService = {
  startSsoLogin: jest.fn(),
  handleSsoCallback: jest.fn(),
  exchangeSsoCode: jest.fn(),
}
jest.mock('../service', () => mockService)

import config from '@/config'
import express from 'express'
import request from 'supertest'
import { errorHandler } from '../../../shared/middlewares/error-handler'
import router from '../routes'
import { SsoCallbackOutcome } from '../types'

const TENANT = '0190a3c2-7b1e-7c3a-9d4e-5f6a7b8c9d0e'
const FRONTEND = config.server.frontendUrl

const app = express()
app.use(express.json())
app.use('/api/v1/auth/sso', router)
app.use(errorHandler)

const setEnabled = (enableSso: boolean) =>
  Object.assign(config.features, { enableSso })

beforeEach(() => {
  jest.resetAllMocks()
  setEnabled(true)
})
afterAll(() => setEnabled(false))

describe('feature flag', () => {
  it.each([
    ['POST', '/api/v1/auth/sso/start'],
    ['POST', '/api/v1/auth/sso/exchange'],
    ['POST', `/api/v1/auth/sso/${TENANT}/acs`],
  ])('%s %s answers 403 while SSO is off', async (_method, path) => {
    setEnabled(false)

    const res = await request(app).post(path).send({})

    expect(res.status).toBe(403)
    expect(res.body.errorCode).toBe('FORBIDDEN_FEATURE_DISABLED')
    expect(mockService.startSsoLogin).not.toHaveBeenCalled()
  })
})

describe('POST /start', () => {
  it('returns the IdP redirect and the binding token', async () => {
    mockService.startSsoLogin.mockResolvedValue({
      redirectUrl: 'https://idp.example.com/sso',
      bindingToken: 'bind',
    })

    const res = await request(app)
      .post('/api/v1/auth/sso/start')
      .send({ email: ' Sam@Fund.com ' })

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({
      redirectUrl: 'https://idp.example.com/sso',
      bindingToken: 'bind',
    })
    expect(mockService.startSsoLogin).toHaveBeenCalledWith('sam@fund.com')
  })

  it('rejects an invalid email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/sso/start')
      .send({ email: 'nope' })

    expect(res.status).toBe(400)
    expect(mockService.startSsoLogin).not.toHaveBeenCalled()
  })
})

describe('POST /:tenantId/acs', () => {
  const post = (body: string, tenant = TENANT) =>
    request(app).post(`/api/v1/auth/sso/${tenant}/acs`).type('form').send(body)

  it('redirects a verified login to the app with its one-time code', async () => {
    mockService.handleSsoCallback.mockResolvedValue({
      outcome: SsoCallbackOutcome.LOGIN_READY,
      code: 'one time/code',
    })

    const res = await post('SAMLResponse=abc&RelayState=state-1')

    expect(res.status).toBe(303)
    expect(res.headers.location).toBe(
      `${FRONTEND}/auth/sso/complete?code=one%20time%2Fcode`,
    )
    expect(mockService.handleSsoCallback).toHaveBeenCalledWith({
      tenantId: TENANT,
      samlResponse: 'abc',
      relayState: 'state-1',
    })
  })

  it.each([
    [SsoCallbackOutcome.LOGIN_FAILED, '/login?sso=failed'],
    [
      SsoCallbackOutcome.TEST_PASSED,
      '/settings/workspace/security?sso_test=passed',
    ],
    [
      SsoCallbackOutcome.TEST_FAILED,
      '/settings/workspace/security?sso_test=failed',
    ],
  ])('sends %s back to the app', async (outcome, path) => {
    mockService.handleSsoCallback.mockResolvedValue({ outcome })

    const res = await post('SAMLResponse=abc')

    expect(res.status).toBe(303)
    expect(res.headers.location).toBe(`${FRONTEND}${path}`)
  })

  it('sends a malformed body to the failure page without calling the service', async () => {
    const res = await post('RelayState=only')

    expect(res.status).toBe(303)
    expect(res.headers.location).toBe(`${FRONTEND}/login?sso=failed`)
    expect(mockService.handleSsoCallback).not.toHaveBeenCalled()
  })

  it('rejects a tenant id that is not a uuid', async () => {
    const res = await post('SAMLResponse=abc', 'not-a-uuid')

    expect(res.status).toBe(400)
    expect(mockService.handleSsoCallback).not.toHaveBeenCalled()
  })

  it('answers a server fault with an error, not a redirect', async () => {
    mockService.handleSsoCallback.mockRejectedValue(new Error('db down'))

    const res = await post('SAMLResponse=abc')

    expect(res.status).toBe(500)
  })
})

describe('POST /exchange', () => {
  const body = { code: 'c', bindingToken: 'b' }

  it('signs the person in and sets the refresh cookie', async () => {
    mockService.exchangeSsoCode.mockResolvedValue({
      requiresOnboarding: false,
      refreshToken: 'refresh-1',
      accessToken: 'access-1',
      user: { userId: 'u1', email: 'sam@fund.com' },
      requiresPhoneVerification: false,
    })

    const res = await request(app).post('/api/v1/auth/sso/exchange').send(body)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      requiresOnboarding: false,
      accessToken: 'access-1',
      requiresPhoneVerification: false,
    })
    expect(res.headers['set-cookie'][0]).toContain('refresh_token=refresh-1')
    expect(mockService.exchangeSsoCode).toHaveBeenCalledWith(
      body,
      expect.any(String),
      expect.any(String),
    )
  })

  it('hands a first-time user an onboarding token and no cookie', async () => {
    mockService.exchangeSsoCode.mockResolvedValue({
      requiresOnboarding: true,
      onboardingToken: 'onboard-1',
      defaultDisplayName: 'sam',
    })

    const res = await request(app).post('/api/v1/auth/sso/exchange').send(body)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      requiresOnboarding: true,
      onboardingToken: 'onboard-1',
    })
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('rejects a body without both values', async () => {
    const res = await request(app)
      .post('/api/v1/auth/sso/exchange')
      .send({ code: 'c' })

    expect(res.status).toBe(400)
  })

  it('passes a refusal through', async () => {
    mockService.exchangeSsoCode.mockRejectedValue(
      Object.assign(new Error('Invalid or expired SSO sign-in'), {
        statusCode: 401,
        isOperational: true,
      }),
    )

    const res = await request(app).post('/api/v1/auth/sso/exchange').send(body)

    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
