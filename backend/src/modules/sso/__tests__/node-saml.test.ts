import { NodeSamlProvider } from '../providers/node-saml'
import {
  SsoConfigurationError,
  SsoVerificationError,
  type SsoConnectionConfig,
} from '../provider'
import {
  buildResponse,
  makeIdpKeys,
  memoryConnectionStore,
  memoryRequestCache,
  requestIdFrom,
  TEST_CERTIFICATE as CERTIFICATE,
} from './saml-fixtures'

const TENANT = 'tenant-1'
const SP = {
  spEntityId: 'https://api.example.com/sso/tenant-1',
  acsUrl: 'https://api.example.com/api/v1/auth/sso/tenant-1/acs',
}
const VALID: SsoConnectionConfig = {
  idpEntityId: 'https://idp.example.com/entity',
  idpSsoUrl: 'https://idp.example.com/sso',
  idpCertificate: CERTIFICATE,
}

const build = (now = new Date('2030-01-01T00:00:00Z')) => {
  const store = memoryConnectionStore()
  const requestCache = memoryRequestCache()
  const provider = new NodeSamlProvider({
    store,
    requestCache,
    serviceProvider: () => SP,
    now: () => now,
  })
  return { provider, store, requestCache }
}

describe('NodeSamlProvider.upsertConnection', () => {
  it('stores a valid connection and returns the SP details for the IdP', async () => {
    const { provider, store } = build()

    await expect(provider.upsertConnection(TENANT, VALID)).resolves.toEqual(SP)
    expect(store.rows.get(TENANT)).toEqual(VALID)
  })

  it('accepts a bare base64 certificate without PEM armour', async () => {
    const { provider } = build()
    const bare = CERTIFICATE.replaceAll(/-----[A-Z ]+-----|\s/g, '')

    await expect(
      provider.upsertConnection(TENANT, { ...VALID, idpCertificate: bare }),
    ).resolves.toEqual(SP)
  })

  it.each([
    ['a non-https sign-in URL', { idpSsoUrl: 'http://idp.example.com/sso' }],
    ['a malformed sign-in URL', { idpSsoUrl: 'not a url' }],
    ['an empty entity id', { idpEntityId: '  ' }],
    ['an unparseable certificate', { idpCertificate: 'garbage' }],
  ])('rejects %s without saving', async (_label, override) => {
    const { provider, store } = build()

    await expect(
      provider.upsertConnection(TENANT, { ...VALID, ...override }),
    ).rejects.toBeInstanceOf(SsoConfigurationError)
    expect(store.rows.size).toBe(0)
  })

  it('rejects a certificate outside its validity window', async () => {
    const early = build(new Date('2020-01-01T00:00:00Z'))
    const late = build(new Date('2130-01-01T00:00:00Z'))

    await expect(
      early.provider.upsertConnection(TENANT, VALID),
    ).rejects.toThrow('expired or not yet valid')
    await expect(late.provider.upsertConnection(TENANT, VALID)).rejects.toThrow(
      'expired or not yet valid',
    )
  })
})

describe('NodeSamlProvider.deleteConnection', () => {
  it('removes the stored connection', async () => {
    const { provider, store } = build()
    await provider.upsertConnection(TENANT, VALID)

    await provider.deleteConnection(TENANT)

    expect(store.rows.has(TENANT)).toBe(false)
  })
})

describe('NodeSamlProvider.startLogin', () => {
  it('redirects to the IdP with the relay state and remembers the request id per tenant', async () => {
    const { provider, requestCache } = build()
    await provider.upsertConnection(TENANT, VALID)

    const { redirectUrl } = await provider.startLogin(TENANT, 'signed-state')

    const url = new URL(redirectUrl)
    expect(`${url.origin}${url.pathname}`).toBe(VALID.idpSsoUrl)
    expect(url.searchParams.get('RelayState')).toBe('signed-state')
    expect(url.searchParams.get('SAMLRequest')).toBeTruthy()
    const keys = [...requestCache.entries.keys()]
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(new RegExp(`^${TENANT}:`))
  })

  it('refuses a tenant with no connection', async () => {
    const { provider } = build()

    await expect(
      provider.startLogin('unknown', 'state'),
    ).rejects.toBeInstanceOf(SsoVerificationError)
  })
})

describe('NodeSamlProvider.completeLogin', () => {
  it('refuses a tenant with no connection', async () => {
    const { provider } = build()

    await expect(
      provider.completeLogin({ tenantId: 'unknown', samlResponse: 'x' }),
    ).rejects.toBeInstanceOf(SsoVerificationError)
  })

  it.each([
    ['garbage that is not base64 XML', 'not-a-saml-response'],
    [
      'well-formed but unsigned XML',
      Buffer.from('<samlp:Response xmlns:samlp="x"></samlp:Response>').toString(
        'base64',
      ),
    ],
  ])('rejects %s', async (_label, samlResponse) => {
    const { provider } = build()
    await provider.upsertConnection(TENANT, VALID)

    await expect(
      provider.completeLogin({ tenantId: TENANT, samlResponse }),
    ).rejects.toBeInstanceOf(SsoVerificationError)
  })
})

describe('NodeSamlProvider.completeLogin with real signed assertions', () => {
  const keys = makeIdpKeys()
  const idp = {
    idpEntityId: VALID.idpEntityId,
    idpSsoUrl: VALID.idpSsoUrl,
    idpCertificate: keys.publicKey,
  }

  const setup = async (tenant = TENANT) => {
    const store = memoryConnectionStore({ [tenant]: idp })
    const requestCache = memoryRequestCache()
    const provider = new NodeSamlProvider({
      store,
      requestCache,
      serviceProvider: () => SP,
    })
    const { redirectUrl } = await provider.startLogin(tenant, 'state-1')
    const requestId = requestIdFrom(redirectUrl)
    const respond = (
      overrides: Partial<Parameters<typeof buildResponse>[0]> = {},
    ) =>
      buildResponse({
        privateKey: keys.privateKey,
        requestId,
        idpEntityId: idp.idpEntityId,
        spEntityId: SP.spEntityId,
        acsUrl: SP.acsUrl,
        email: 'Sam@Fund.com',
        ...overrides,
      })
    return { provider, respond, requestCache, tenant }
  }

  it('accepts a signed assertion that answers our request and returns the verified identity', async () => {
    const { provider, respond } = await setup()

    const identity = await provider.completeLogin({
      tenantId: TENANT,
      samlResponse: respond(),
    })

    expect(identity).toMatchObject({
      tenantId: TENANT,
      email: 'sam@fund.com',
      nameId: 'Sam@Fund.com',
    })
  })

  it('reads the email from an attribute when the NameID is opaque', async () => {
    const { provider, respond } = await setup()

    const identity = await provider.completeLogin({
      tenantId: TENANT,
      samlResponse: respond({
        email: undefined,
        emailAttribute: 'Kim@Fund.com',
      }),
    })

    expect(identity.email).toBe('kim@fund.com')
    expect(identity.nameId).toBe('opaque-id')
    expect(identity.attributes.email).toBe('Kim@Fund.com')
  })

  it('rejects an assertion with no email anywhere', async () => {
    const { provider, respond } = await setup()

    await expect(
      provider.completeLogin({
        tenantId: TENANT,
        samlResponse: respond({
          email: undefined,
          emailAttribute: 'not-an-email',
        }),
      }),
    ).rejects.toThrow('no usable email')
  })

  it('refuses an unsigned assertion', async () => {
    const { provider, respond } = await setup()

    await expect(
      provider.completeLogin({
        tenantId: TENANT,
        samlResponse: respond({ sign: false }),
      }),
    ).rejects.toBeInstanceOf(SsoVerificationError)
  })

  it('refuses an assertion edited after it was signed', async () => {
    const { provider, respond } = await setup()
    const xml = Buffer.from(respond(), 'base64').toString()
    const forged = Buffer.from(
      xml.replace('Sam@Fund.com', 'ceo@fund.com'),
    ).toString('base64')

    await expect(
      provider.completeLogin({ tenantId: TENANT, samlResponse: forged }),
    ).rejects.toBeInstanceOf(SsoVerificationError)
  })

  it('refuses an assertion signed by a key the tenant does not trust', async () => {
    const { provider, respond } = await setup()
    const attacker = makeIdpKeys()

    await expect(
      provider.completeLogin({
        tenantId: TENANT,
        samlResponse: respond({ privateKey: attacker.privateKey }),
      }),
    ).rejects.toBeInstanceOf(SsoVerificationError)
  })

  it('refuses an assertion issued for another audience', async () => {
    const { provider, respond } = await setup()

    await expect(
      provider.completeLogin({
        tenantId: TENANT,
        samlResponse: respond({ audience: 'https://other-sp.example.com' }),
      }),
    ).rejects.toBeInstanceOf(SsoVerificationError)
  })

  it('refuses a response to a request we never made', async () => {
    const { provider, respond } = await setup()

    await expect(
      provider.completeLogin({
        tenantId: TENANT,
        samlResponse: respond({ requestId: '_never-issued' }),
      }),
    ).rejects.toBeInstanceOf(SsoVerificationError)
  })

  it('refuses a replay: a request id works once', async () => {
    const { provider, respond } = await setup()
    const response = respond()

    await expect(
      provider.completeLogin({ tenantId: TENANT, samlResponse: response }),
    ).resolves.toBeDefined()
    await expect(
      provider.completeLogin({ tenantId: TENANT, samlResponse: response }),
    ).rejects.toBeInstanceOf(SsoVerificationError)
  })

  it('refuses a response that answers another tenant’s request', async () => {
    const first = await setup('tenant-1')
    const store = memoryConnectionStore({ 'tenant-2': idp })
    const second = new NodeSamlProvider({
      store,
      requestCache: first.requestCache,
      serviceProvider: () => SP,
    })

    await expect(
      second.completeLogin({
        tenantId: 'tenant-2',
        samlResponse: first.respond(),
      }),
    ).rejects.toBeInstanceOf(SsoVerificationError)
  })
})
