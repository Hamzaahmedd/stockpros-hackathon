import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('@/shared/api/axios', () => ({ default: api }))

import { exchangeSsoCode, getLoginOptions, startSsoLogin } from './services'
import { DomainAuthPolicy } from './types'

const envelope = (data: unknown) => ({
  data: { success: true, message: 'ok', data },
})

beforeEach(() => {
  api.post.mockReset()
})

describe('getLoginOptions', () => {
  it('returns the policy and SSO availability', async () => {
    api.post.mockResolvedValue(
      envelope({ authPolicy: 'SAML_SSO', ssoAvailable: true }),
    )

    await expect(getLoginOptions('sam@fund.com')).resolves.toEqual({
      authPolicy: DomainAuthPolicy.SAML_SSO,
      ssoAvailable: true,
    })
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/login-options', {
      email: 'sam@fund.com',
    })
  })

  it('treats a missing or odd ssoAvailable as false', async () => {
    api.post.mockResolvedValue(
      envelope({ authPolicy: 'GOOGLE_ONLY', ssoAvailable: 'yes' }),
    )

    await expect(getLoginOptions('sam@fund.com')).resolves.toEqual({
      authPolicy: DomainAuthPolicy.GOOGLE_ONLY,
      ssoAvailable: false,
    })
  })

  it('falls back to ANY for an unknown policy', async () => {
    api.post.mockResolvedValue(envelope({ authPolicy: 'MAGIC_ONLY' }))

    await expect(getLoginOptions('sam@fund.com')).resolves.toEqual({
      authPolicy: DomainAuthPolicy.ANY,
      ssoAvailable: false,
    })
  })

  it('never throws: a failed lookup means no restriction', async () => {
    api.post.mockRejectedValue(new Error('network'))

    await expect(getLoginOptions('sam@fund.com')).resolves.toEqual({
      authPolicy: DomainAuthPolicy.ANY,
      ssoAvailable: false,
    })
  })
})

describe('startSsoLogin', () => {
  it('returns the IdP redirect and the binding token', async () => {
    api.post.mockResolvedValue(
      envelope({ redirectUrl: 'https://idp.example.com', bindingToken: 'b' }),
    )

    await expect(startSsoLogin('sam@fund.com')).resolves.toEqual({
      redirectUrl: 'https://idp.example.com',
      bindingToken: 'b',
    })
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/sso/start', {
      email: 'sam@fund.com',
    })
  })

  it('lets a refusal through so the page can report it', async () => {
    api.post.mockRejectedValue(new Error('SSO is not available'))

    await expect(startSsoLogin('sam@gmail.com')).rejects.toThrow(
      'SSO is not available',
    )
  })
})

describe('exchangeSsoCode', () => {
  it('posts the code with this browser’s binding token', async () => {
    api.post.mockResolvedValue({ data: {} })

    await exchangeSsoCode('code-1', 'binding-1')

    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/sso/exchange', {
      code: 'code-1',
      bindingToken: 'binding-1',
    })
  })
})
