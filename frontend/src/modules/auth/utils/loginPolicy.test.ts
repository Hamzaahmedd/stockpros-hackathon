import { describe, expect, it } from 'vitest'
import { DomainAuthPolicy } from '../types'
import {
  DEFAULT_LOGIN_METHOD_MESSAGE,
  isGoogleRequired,
  loginMethodRequiredMessage,
  loginPolicyNotice,
  parseDomainAuthPolicy,
} from './loginPolicy'

const refusal = (body: Record<string, unknown>) => ({
  response: { status: 403, data: body },
})

describe('parseDomainAuthPolicy', () => {
  it.each(Object.values(DomainAuthPolicy))('accepts %s', (policy) => {
    expect(parseDomainAuthPolicy(policy)).toBe(policy)
  })

  it('rejects anything else', () => {
    expect(parseDomainAuthPolicy('MAGIC_ONLY')).toBeUndefined()
  })
})

describe('isGoogleRequired', () => {
  it('is false only for unrestricted domains', () => {
    expect(isGoogleRequired(DomainAuthPolicy.ANY)).toBe(false)
    expect(isGoogleRequired(DomainAuthPolicy.GOOGLE_ONLY)).toBe(true)
    expect(isGoogleRequired(DomainAuthPolicy.GOOGLE_WORKSPACE)).toBe(true)
  })
})

describe('loginPolicyNotice', () => {
  it('has no notice for unrestricted domains', () => {
    expect(loginPolicyNotice(DomainAuthPolicy.ANY)).toBeNull()
  })

  it('asks for Google sign-in', () => {
    expect(loginPolicyNotice(DomainAuthPolicy.GOOGLE_ONLY)).toBe(
      DEFAULT_LOGIN_METHOD_MESSAGE,
    )
  })

  it('mentions the Workspace account when one is required', () => {
    expect(loginPolicyNotice(DomainAuthPolicy.GOOGLE_WORKSPACE)).toContain(
      'Google Workspace',
    )
  })
})

describe('loginMethodRequiredMessage', () => {
  it('returns the server message for a login-method refusal', () => {
    expect(
      loginMethodRequiredMessage(
        refusal({ errorCode: 'LOGIN_METHOD_REQUIRED', message: 'Use Google' }),
      ),
    ).toBe('Use Google')
  })

  it('falls back to the default message when the server sent none', () => {
    expect(
      loginMethodRequiredMessage(
        refusal({ errorCode: 'LOGIN_METHOD_REQUIRED' }),
      ),
    ).toBe(DEFAULT_LOGIN_METHOD_MESSAGE)
  })

  it('ignores other errors', () => {
    expect(
      loginMethodRequiredMessage(refusal({ errorCode: 'OTHER', message: 'x' })),
    ).toBeNull()
    expect(loginMethodRequiredMessage(new Error('boom'))).toBeNull()
  })
})
