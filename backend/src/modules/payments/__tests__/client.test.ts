const mockPost = jest.fn()

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({ post: mockPost })),
  },
}))

jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: { debug: jest.fn(), error: jest.fn() },
}))

const loadClient = (safepayOverrides: Record<string, unknown>) => {
  jest.resetModules()
  jest.doMock('@/config', () => {
    const actual = jest.requireActual('@/config')
    const patched = {
      ...actual.default,
      safepay: { ...actual.default.safepay, ...safepayOverrides },
    }
    return { __esModule: true, default: patched, config: patched }
  })
  return jest.requireActual('../client') as typeof import('../client')
}

beforeEach(() => {
  mockPost.mockReset()
})

describe('initPaymentSession', () => {
  it('short-circuits to a mock token when mockProvider is enabled, without calling Safepay', async () => {
    const { initPaymentSession } = loadClient({ mockProvider: true })
    const result = await initPaymentSession(599_900)
    expect(result.token).toMatch(/^mock_/)
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('throws when the provider is live but no API key is configured', async () => {
    const { initPaymentSession } = loadClient({
      mockProvider: false,
      apiKey: '',
    })
    await expect(initPaymentSession(599_900)).rejects.toThrow(
      'Safepay is not configured (missing SAFEPAY_API_KEY)',
    )
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('returns the token from a live init call', async () => {
    mockPost.mockResolvedValue({ data: { data: { token: 'trk_live' } } })
    const { initPaymentSession } = loadClient({
      mockProvider: false,
      apiKey: 'live-key',
    })
    const result = await initPaymentSession(599_900)
    expect(result).toEqual({ token: 'trk_live' })
    expect(mockPost).toHaveBeenCalledWith('/order/v1/init', {
      amount: 599_900,
      client: 'live-key',
      currency: 'PKR',
      environment: 'sandbox',
    })
  })

  it('throws when the live response does not include a token', async () => {
    mockPost.mockResolvedValue({ data: {} })
    const { initPaymentSession } = loadClient({
      mockProvider: false,
      apiKey: 'live-key',
    })
    await expect(initPaymentSession(599_900)).rejects.toThrow(
      'Failed to initiate Safepay payment session',
    )
  })

  it('wraps a network/API failure', async () => {
    mockPost.mockRejectedValue(new Error('timeout'))
    const { initPaymentSession } = loadClient({
      mockProvider: false,
      apiKey: 'live-key',
    })
    await expect(initPaymentSession(599_900)).rejects.toThrow(
      'Failed to initiate Safepay payment session',
    )
  })
})

describe('buildCheckoutUrl', () => {
  const params = {
    token: 'trk_1',
    orderId: 'order-1',
    redirectUrl: 'https://app.example/success',
    cancelUrl: 'https://app.example/cancel',
  }

  it('builds a mock frontend URL when mockProvider is enabled', () => {
    const { buildCheckoutUrl } = loadClient({ mockProvider: true })
    const url = buildCheckoutUrl(params)
    expect(url).toContain('/plans/result?tracker_id=trk_1&status=mock-pending')
  })

  it('builds the real Safepay checkout URL with webhooks forced on', () => {
    const { buildCheckoutUrl } = loadClient({ mockProvider: false })
    const url = buildCheckoutUrl(params)
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe(
      'https://sandbox.api.getsafepay.com/checkout/pay',
    )
    expect(parsed.searchParams.get('beacon')).toBe('trk_1')
    expect(parsed.searchParams.get('order_id')).toBe('order-1')
    expect(parsed.searchParams.get('redirect_url')).toBe(params.redirectUrl)
    expect(parsed.searchParams.get('cancel_url')).toBe(params.cancelUrl)
    expect(parsed.searchParams.get('webhooks')).toBe('true')
    expect(parsed.searchParams.get('source')).toBe('custom')
  })
})
