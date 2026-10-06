/**
 * The whole SSO login through the real code: start -> IdP -> ACS -> one-time
 * code -> session. Only the database and Redis are replaced (an in-memory
 * database and the in-process key-value store); the router, controller,
 * service, SAML adapter, state handling and auth sign-in are all real, and the
 * "IdP" signs real assertions with a throwaway key.
 */
jest.mock('../../market/infrastructure/finnhub-stream', () => ({
  finnhubService: {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    getQuote: jest.fn().mockResolvedValue({ c: 100, d: 1 }),
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

const mockDb: any = {
  user: { findUnique: jest.fn() },
  userSession: { create: jest.fn() },
  userRole: { create: jest.fn() },
  rbacConfiguration: { findUnique: jest.fn() },
  teamDomain: { findFirst: jest.fn() },
  teamSsoConnection: { findFirst: jest.fn(), updateMany: jest.fn() },
}
jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockDb
  },
}))

import config from '@/config'
import { DomainAuthPolicy, LoginMethod, UserStatus } from '@prisma/client'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { errorHandler } from '../../../shared/middlewares/error-handler'
import router from '../routes'
import { serviceProviderFor } from '../service'
import { buildResponse, makeIdpKeys, requestIdFrom } from './saml-fixtures'

const TENANT = '0190a3c2-7b1e-7c3a-9d4e-5f6a7b8c9d0e'
const EMAIL = 'sam@fund.com'
const IDP_ENTITY = 'https://idp.example.com/entity'
const keys = makeIdpKeys()
const sp = serviceProviderFor(TENANT)

const app = express()
app.use(express.json())
app.use('/api/v1/auth/sso', router)
app.use(errorHandler)

const existingUser = {
  id: 'user-1',
  email: EMAIL,
  displayName: 'Sam',
  status: UserStatus.ACTIVE,
  phoneVerifiedAt: null,
  userRoles: [{ roleId: 'role-1', role: { name: 'MEMBER' } }],
}

/** The tenant's domain as the database would answer each of the lookups the flow makes. */
const mockDomain = (
  options: { policy?: DomainAuthPolicy; enabled?: boolean } = {},
) => {
  const { policy = DomainAuthPolicy.ANY, enabled = true } = options
  mockDb.teamDomain.findFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => {
      if ('authPolicy' in where) {
        return policy === DomainAuthPolicy.ANY
          ? null
          : { domain: 'fund.com', authPolicy: policy, ssoTenantId: TENANT }
      }
      if (!enabled) return null
      return {
        id: TENANT,
        teamId: 'team-1',
        domain: 'fund.com',
        ssoTenantId: TENANT,
      }
    },
  )
}

const start = (email = EMAIL) =>
  request(app).post('/api/v1/auth/sso/start').send({ email })

/** Runs /start and answers it the way the IdP would, returning what the browser would post to the ACS. */
const signInAtIdp = async (options: { email?: string } = {}) => {
  const started = await start()
  expect(started.status).toBe(200)
  const { redirectUrl, bindingToken } = started.body.data
  const url = new URL(redirectUrl)
  const samlResponse = buildResponse({
    privateKey: keys.privateKey,
    requestId: requestIdFrom(redirectUrl),
    idpEntityId: IDP_ENTITY,
    spEntityId: sp.spEntityId,
    acsUrl: sp.acsUrl,
    email: options.email ?? EMAIL,
  })
  return {
    bindingToken,
    samlResponse,
    relayState: url.searchParams.get('RelayState') ?? '',
  }
}

const postAcs = (samlResponse: string, relayState: string) =>
  request(app)
    .post(`/api/v1/auth/sso/${TENANT}/acs`)
    .type('form')
    .send({ SAMLResponse: samlResponse, RelayState: relayState })

const codeFrom = (location: string): string =>
  new URL(location).searchParams.get('code') ?? ''

beforeEach(() => {
  jest.resetAllMocks()
  Object.assign(config.features, { enableSso: true })
  mockDomain()
  mockDb.teamSsoConnection.findFirst.mockResolvedValue({
    idpEntityId: IDP_ENTITY,
    idpSsoUrl: 'https://idp.example.com/sso',
    idpCertificate: keys.publicKey,
  })
  mockDb.teamSsoConnection.updateMany.mockResolvedValue({ count: 1 })
  mockDb.user.findUnique.mockResolvedValue(existingUser)
  mockDb.userSession.create.mockResolvedValue({})
  mockDb.rbacConfiguration.findUnique.mockResolvedValue({
    defaultRole: { id: 'role-default' },
  })
})
afterAll(() => Object.assign(config.features, { enableSso: false }))

describe('a complete SSO login', () => {
  it('signs a known user in and records the SSO session', async () => {
    const { bindingToken, samlResponse, relayState } = await signInAtIdp()

    const acs = await postAcs(samlResponse, relayState)
    expect(acs.status).toBe(303)
    expect(acs.headers.location).toContain('/auth/sso/complete?code=')

    const exchanged = await request(app)
      .post('/api/v1/auth/sso/exchange')
      .send({ code: codeFrom(acs.headers.location), bindingToken })

    expect(exchanged.status).toBe(200)
    expect(exchanged.body).toMatchObject({
      requiresOnboarding: false,
      user: { userId: 'user-1', email: EMAIL },
    })
    expect(exchanged.headers['set-cookie'][0]).toContain('refresh_token=')
    const claims = jwt.verify(
      exchanged.body.accessToken,
      config.auth.accessTokenSecret,
    ) as { sub: string; sid: string }
    const session = mockDb.userSession.create.mock.calls[0][0].data
    expect(claims).toMatchObject({ sub: 'user-1', sid: session.id })
    expect(session).toMatchObject({
      userId: 'user-1',
      loginMethod: LoginMethod.SSO,
      ssoTenantId: TENANT,
    })
  })

  it('works under the SAML_SSO policy, where it is the only way in', async () => {
    mockDomain({ policy: DomainAuthPolicy.SAML_SSO })
    const { bindingToken, samlResponse, relayState } = await signInAtIdp()

    const acs = await postAcs(samlResponse, relayState)
    const exchanged = await request(app)
      .post('/api/v1/auth/sso/exchange')
      .send({ code: codeFrom(acs.headers.location), bindingToken })

    expect(exchanged.status).toBe(200)
  })

  it('gives a first-time user an onboarding token that names the SSO tenant', async () => {
    mockDb.user.findUnique.mockResolvedValue(null)
    const { bindingToken, samlResponse, relayState } = await signInAtIdp()

    const acs = await postAcs(samlResponse, relayState)
    const exchanged = await request(app)
      .post('/api/v1/auth/sso/exchange')
      .send({ code: codeFrom(acs.headers.location), bindingToken })

    expect(exchanged.body.requiresOnboarding).toBe(true)
    const claims = jwt.verify(
      exchanged.body.onboardingToken,
      config.auth.accessTokenSecret,
    ) as Record<string, unknown>
    expect(claims).toMatchObject({
      sub: EMAIL,
      method: LoginMethod.SSO,
      sso: TENANT,
    })
    expect(exchanged.headers['set-cookie']).toBeUndefined()
    expect(mockDb.userSession.create).not.toHaveBeenCalled()
  })
})

describe('attacks on the login', () => {
  it('refuses a replay of the same IdP response', async () => {
    const { samlResponse, relayState } = await signInAtIdp()
    await postAcs(samlResponse, relayState)

    const replay = await postAcs(samlResponse, relayState)

    expect(replay.status).toBe(303)
    expect(replay.headers.location).toContain('/login?sso=failed')
  })

  it('refuses a one-time code used twice', async () => {
    const { bindingToken, samlResponse, relayState } = await signInAtIdp()
    const acs = await postAcs(samlResponse, relayState)
    const code = codeFrom(acs.headers.location)
    await request(app)
      .post('/api/v1/auth/sso/exchange')
      .send({ code, bindingToken })

    const again = await request(app)
      .post('/api/v1/auth/sso/exchange')
      .send({ code, bindingToken })

    expect(again.status).toBe(401)
  })

  it('refuses a code presented without the starting browser’s binding token', async () => {
    const { samlResponse, relayState } = await signInAtIdp()
    const acs = await postAcs(samlResponse, relayState)

    const forwarded = await request(app)
      .post('/api/v1/auth/sso/exchange')
      .send({ code: codeFrom(acs.headers.location), bindingToken: 'attacker' })

    expect(forwarded.status).toBe(401)
    expect(mockDb.userSession.create).not.toHaveBeenCalled()
  })

  it('refuses an assertion for an email outside the tenant’s domain', async () => {
    const { samlResponse, relayState } = await signInAtIdp({
      email: 'ceo@other.com',
    })

    const acs = await postAcs(samlResponse, relayState)

    expect(acs.headers.location).toContain('/login?sso=failed')
    expect(mockDb.userSession.create).not.toHaveBeenCalled()
  })

  it('refuses a response signed by someone else’s key', async () => {
    const started = await start()
    const { redirectUrl } = started.body.data
    const forged = buildResponse({
      privateKey: makeIdpKeys().privateKey,
      requestId: requestIdFrom(redirectUrl),
      idpEntityId: IDP_ENTITY,
      spEntityId: sp.spEntityId,
      acsUrl: sp.acsUrl,
      email: EMAIL,
    })

    const acs = await postAcs(
      forged,
      new URL(redirectUrl).searchParams.get('RelayState') ?? '',
    )

    expect(acs.headers.location).toContain('/login?sso=failed')
  })

  it('refuses an IdP-initiated response that answers no request of ours', async () => {
    const unsolicited = buildResponse({
      privateKey: keys.privateKey,
      requestId: '_never-issued',
      idpEntityId: IDP_ENTITY,
      spEntityId: sp.spEntityId,
      acsUrl: sp.acsUrl,
      email: EMAIL,
    })

    const acs = await postAcs(unsolicited, 'made-up-relay-state')

    expect(acs.headers.location).toContain('/login?sso=failed')
  })

  it('refuses the callback once SSO has been disabled mid-login', async () => {
    const { bindingToken, samlResponse, relayState } = await signInAtIdp()
    mockDomain({ enabled: false })

    const acs = await postAcs(samlResponse, relayState)

    expect(acs.headers.location).toContain('/login?sso=failed')
    expect(
      (
        await request(app)
          .post('/api/v1/auth/sso/exchange')
          .send({ code: 'none', bindingToken })
      ).status,
    ).toBe(401)
  })

  it('does not start a login for a domain without SSO', async () => {
    mockDomain({ enabled: false })

    const started = await start('pat@gmail.com')

    expect(started.status).toBe(400)
  })
})

describe('while the feature is switched off', () => {
  it('refuses every SSO route', async () => {
    Object.assign(config.features, { enableSso: false })

    const started = await start()

    expect(started.status).toBe(403)
    expect(started.body.errorCode).toBe('FORBIDDEN_FEATURE_DISABLED')
  })
})
