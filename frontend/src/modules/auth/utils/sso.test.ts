import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearSsoBinding,
  isSafeRedirectUrl,
  readSsoBinding,
  saveSsoBinding,
} from './sso'

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('SSO binding token', () => {
  it('is kept in session storage until cleared', () => {
    expect(readSsoBinding()).toBeNull()

    saveSsoBinding('secret')
    expect(readSsoBinding()).toBe('secret')

    clearSsoBinding()
    expect(readSsoBinding()).toBeNull()
  })

  it('degrades quietly when storage is unavailable', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('sessionStorage', {
      setItem: blocked,
      getItem: blocked,
      removeItem: blocked,
    })

    expect(() => saveSsoBinding('secret')).not.toThrow()
    expect(readSsoBinding()).toBeNull()
    expect(() => clearSsoBinding()).not.toThrow()
  })
})

describe('isSafeRedirectUrl', () => {
  it('accepts https addresses', () => {
    expect(isSafeRedirectUrl('https://idp.example.com/sso?SAMLRequest=x')).toBe(
      true,
    )
  })

  it.each([
    'http://idp.example.com/sso',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    '//idp.example.com/sso',
    '/relative/path',
    'not a url',
    '',
  ])('refuses %s', (value) => {
    expect(isSafeRedirectUrl(value)).toBe(false)
  })
})
