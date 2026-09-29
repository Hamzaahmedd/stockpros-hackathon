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

describe('createSubscriptionCheckout', () => {
  const params = {
    reference: 'sub-1',
    redirectUrl: 'https://app.example/success',
    cancelUrl: 'https://app.example/cancel',
  }

  it('short-circuits to a mock subscribe URL when mockProvider is enabled, without calling Safepay', async () => {
    const { createSubscriptionCheckout } = loadClient({ mockProvider: true })
    const result = await createSubscriptionCheckout(params)
    expect(result.safepaySubscriptionId).toBe('sub-1')
    expect(result.subscriptionCheckoutUrl).toContain(
      '/plans/result?tracker_id=sub-1&status=mock-pending',
    )
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('throws when the provider is live but no API key is configured', async () => {
    const { createSubscriptionCheckout } = loadClient({
      mockProvider: false,
      apiKey: '',
      proPlanId: 'plan_1',
    })
    await expect(createSubscriptionCheckout(params)).rejects.toThrow(
      'Safepay is not configured (missing SAFEPAY_API_KEY)',
    )
  })

  it('throws when the provider is live but no Plan id is configured', async () => {
    const { createSubscriptionCheckout } = loadClient({
      mockProvider: false,
      apiKey: 'live-key',
      proPlanId: '',
    })
    await expect(createSubscriptionCheckout(params)).rejects.toThrow(
      'Safepay is not configured (missing SAFEPAY_PRO_PLAN_ID)',
    )
  })

  it('fetches a passport token and builds the subscribe URL from it', async () => {
    mockPost.mockResolvedValue({ data: { data: { token: 'tbt-value' } } })
    const { createSubscriptionCheckout } = loadClient({
      mockProvider: false,
      apiKey: 'live-key',
      proPlanId: 'plan_1',
    })

    const result = await createSubscriptionCheckout(params)

    expect(mockPost).toHaveBeenCalledWith('/client/passport/v1/token', {
      client: 'live-key',
      environment: 'sandbox',
    })
    expect(result.safepaySubscriptionId).toBe('sub-1')
    const url = new URL(result.subscriptionCheckoutUrl)
    expect(url.origin + url.pathname).toBe(
      'https://sandbox.api.getsafepay.com/checkout/pay/subscribe',
    )
    expect(url.searchParams.get('plan_id')).toBe('plan_1')
    expect(url.searchParams.get('tbt')).toBe('tbt-value')
    expect(url.searchParams.get('reference')).toBe('sub-1')
    expect(url.searchParams.get('redirect_url')).toBe(params.redirectUrl)
    expect(url.searchParams.get('cancel_url')).toBe(params.cancelUrl)
  })

  it('throws when the passport response does not include a token', async () => {
    mockPost.mockResolvedValue({ data: {} })
    const { createSubscriptionCheckout } = loadClient({
      mockProvider: false,
      apiKey: 'live-key',
      proPlanId: 'plan_1',
    })
    await expect(createSubscriptionCheckout(params)).rejects.toThrow(
      'Failed to create Safepay subscription checkout',
    )
  })

  it('wraps a network/API failure', async () => {
    mockPost.mockRejectedValue(new Error('timeout'))
    const { createSubscriptionCheckout } = loadClient({
      mockProvider: false,
      apiKey: 'live-key',
      proPlanId: 'plan_1',
    })
    await expect(createSubscriptionCheckout(params)).rejects.toThrow(
      'Failed to create Safepay subscription checkout',
    )
  })
})

describe('pauseSafepaySubscription / resumeSafepaySubscription', () => {
  it('no-ops in mock mode without calling Safepay', async () => {
    const { pauseSafepaySubscription, resumeSafepaySubscription } = loadClient({
      mockProvider: true,
    })
    await pauseSafepaySubscription('sub-1')
    await resumeSafepaySubscription('sub-1')
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('throws when live but no API key is configured', async () => {
    const { pauseSafepaySubscription } = loadClient({
      mockProvider: false,
      apiKey: '',
      proPlanId: 'plan_1',
    })
    await expect(pauseSafepaySubscription('sub-1')).rejects.toThrow(
      'Safepay is not configured (missing SAFEPAY_API_KEY)',
    )
  })

  it('pauses a subscription via a live API call', async () => {
    mockPost.mockResolvedValue({ data: {} })
    const { pauseSafepaySubscription } = loadClient({
      mockProvider: false,
      apiKey: 'live-key',
      proPlanId: 'plan_1',
    })
    await pauseSafepaySubscription('sub-1')
    expect(mockPost).toHaveBeenCalledWith(
      '/client/subscriptions/v1/sub-1/pause',
      { client: 'live-key' },
    )
  })

  it('wraps a pause failure', async () => {
    mockPost.mockRejectedValue(new Error('timeout'))
    const { pauseSafepaySubscription } = loadClient({
      mockProvider: false,
      apiKey: 'live-key',
      proPlanId: 'plan_1',
    })
    await expect(pauseSafepaySubscription('sub-1')).rejects.toThrow(
      'Failed to pause Safepay subscription',
    )
  })

  it('resumes a subscription via a live API call', async () => {
    mockPost.mockResolvedValue({ data: {} })
    const { resumeSafepaySubscription } = loadClient({
      mockProvider: false,
      apiKey: 'live-key',
      proPlanId: 'plan_1',
    })
    await resumeSafepaySubscription('sub-1')
    expect(mockPost).toHaveBeenCalledWith(
      '/client/subscriptions/v1/sub-1/resume',
      { client: 'live-key' },
    )
  })

  it('wraps a resume failure', async () => {
    mockPost.mockRejectedValue(new Error('timeout'))
    const { resumeSafepaySubscription } = loadClient({
      mockProvider: false,
      apiKey: 'live-key',
      proPlanId: 'plan_1',
    })
    await expect(resumeSafepaySubscription('sub-1')).rejects.toThrow(
      'Failed to resume Safepay subscription',
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
