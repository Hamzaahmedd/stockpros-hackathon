import { NodeSamlProvider } from '../providers/node-saml'
import {
  SsoConfigurationError,
  SsoVerificationError,
  type SsoConnectionConfig,
  type SsoConnectionStore,
  type SsoRequestCache,
} from '../provider'

// Self-signed, public-only certificate valid 2026-10-06 to 2126-09-12 (test fixture, no private key kept).
const CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIURFVIdbeepkKtHdK4V3H6pK9lM+AwDQYJKoZIhvcNAQEL
BQAwEzERMA8GA1UEAwwIdGVzdC1pZHAwIBcNMjYxMDA2MTE0MTQ3WhgPMjEyNjA5
MTIxMTQxNDdaMBMxETAPBgNVBAMMCHRlc3QtaWRwMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAruXDE3pJcK6WQw1Xp3dTbXB10MiOq5gLGLWSIctcTxvj
K67HljlLTwvkjoLIOU+zvNPhFxAOlecn9tX3J7kJr0wI3NisAKLmAysSuPR9x4Kw
d9qRrwDnQ5Z46OweMwHnhmIxvahl0kfxrAuNEED0Nv6BQglVadKQh6iVrnQJEvtX
yZDJJxMrpEBmLEwzr8p7uZTEXz4qyB51b52/bTq6FVnj/ALq32vLWFstJEn5Bn/p
TdjuDJDpZSFECtcaeNik1Sex/4N4IhJUmXymMLzrWmcaxPME8reWZmo8DhccAI6l
KlUTbN/E/3YjXuIpCytVL8kGxPppt6vn3LEozJwE8QIDAQABo1MwUTAdBgNVHQ4E
FgQU/tL8BugWydTMHntCkTZEa0rrt80wHwYDVR0jBBgwFoAU/tL8BugWydTMHntC
kTZEa0rrt80wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAep6P
k5b6xhLur0cblPEYx7ALAoLEY9ShbXrNpVrIQtfxDtdoKR+DITfjQkOUpaBGc8u3
2Bwqpy3ZagEy1qAfPHHu5eKW+pTsPr8r0wggwls3HcLQfLePfz0T9lITDIXZiv1k
eklKxw22l6uiRieS6bblCc2qjI9n4bq0ILz29OVdVeHwSCzuJ0tVCgsIuHw/KjbE
1RXjkPPNbdMuvAdKpFQesG0vn92wmrmdFkzoF4kCgRhc+FZ0H7bQpZPR+OlGU0xw
FZfZygkbiuckX84xnINQ7R1IEJMw/63fi/XqR80tMkB57I96KC+0NXZME+rqdV9d
7h64CI1cyD4JUNMIWQ==
-----END CERTIFICATE-----`

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

const memoryStore = (): SsoConnectionStore & {
  rows: Map<string, SsoConnectionConfig>
} => {
  const rows = new Map<string, SsoConnectionConfig>()
  return {
    rows,
    get: async (id) => rows.get(id) ?? null,
    save: async (id, config) => {
      rows.set(id, config)
    },
    remove: async (id) => {
      rows.delete(id)
    },
  }
}

const memoryCache = (): SsoRequestCache & { entries: Map<string, string> } => {
  const entries = new Map<string, string>()
  return {
    entries,
    save: async (key, value) => {
      entries.set(key, value)
    },
    get: async (key) => entries.get(key) ?? null,
    remove: async (key) => {
      entries.delete(key)
    },
  }
}

const build = (now = new Date('2030-01-01T00:00:00Z')) => {
  const store = memoryStore()
  const requestCache = memoryCache()
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
