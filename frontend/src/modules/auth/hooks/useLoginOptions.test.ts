import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const services = vi.hoisted(() => ({ getLoginOptions: vi.fn() }))
vi.mock('../services', () => services)

import { DomainAuthPolicy } from '../types'
import { useLoginOptions } from './useLoginOptions'

const SSO = { authPolicy: DomainAuthPolicy.SAML_SSO, ssoAvailable: true }
const UNRESTRICTED = { authPolicy: DomainAuthPolicy.ANY, ssoAvailable: false }

beforeEach(() => {
  vi.useFakeTimers()
  services.getLoginOptions.mockReset()
})
afterEach(() => vi.useRealTimers())

const settle = () => act(() => vi.advanceTimersByTimeAsync(450))

describe('useLoginOptions', () => {
  it('is unrestricted until a valid email has been typed and paused on', async () => {
    const { result, rerender } = renderHook(
      ({ email }) => useLoginOptions(email),
      {
        initialProps: { email: 'sam@' },
      },
    )

    await settle()
    expect(result.current).toEqual(UNRESTRICTED)
    expect(services.getLoginOptions).not.toHaveBeenCalled()

    services.getLoginOptions.mockResolvedValue(SSO)
    rerender({ email: 'sam@fund.com' })
    expect(result.current).toEqual(UNRESTRICTED)
    await settle()

    expect(services.getLoginOptions).toHaveBeenCalledWith('sam@fund.com')
    expect(result.current).toEqual(SSO)
  })

  it('looks up only after typing pauses, using the normalised email', async () => {
    services.getLoginOptions.mockResolvedValue(SSO)
    const { rerender } = renderHook(({ email }) => useLoginOptions(email), {
      initialProps: { email: 'Sam@Fund.com' },
    })

    await act(() => vi.advanceTimersByTimeAsync(200))
    rerender({ email: 'SAM@FUND.COM' })
    await settle()

    expect(services.getLoginOptions).toHaveBeenCalledTimes(1)
    expect(services.getLoginOptions).toHaveBeenCalledWith('sam@fund.com')
  })

  it('drops the answer for an earlier email', async () => {
    let resolveFirst: (value: typeof SSO) => void = () => undefined
    services.getLoginOptions
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValueOnce(UNRESTRICTED)
    const { result, rerender } = renderHook(
      ({ email }) => useLoginOptions(email),
      {
        initialProps: { email: 'sam@fund.com' },
      },
    )
    await settle()

    rerender({ email: 'sam@other.com' })
    await settle()
    await act(async () => resolveFirst(SSO))

    expect(result.current).toEqual(UNRESTRICTED)
  })

  it('forgets the answer when the email stops matching', async () => {
    services.getLoginOptions.mockResolvedValue(SSO)
    const { result, rerender } = renderHook(
      ({ email }) => useLoginOptions(email),
      {
        initialProps: { email: 'sam@fund.com' },
      },
    )
    await settle()
    expect(result.current).toEqual(SSO)

    rerender({ email: 'sam@fund.co' })

    expect(result.current).toEqual(UNRESTRICTED)
  })
})
