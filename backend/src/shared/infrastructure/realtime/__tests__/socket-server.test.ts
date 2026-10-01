import { EventEmitter } from 'node:events'

class FakeIOServer {
  public middlewares: Array<
    (socket: any, next: (err?: Error) => void) => void
  > = []
  public connectionHandlers: Array<(socket: any) => void> = []
  public rooms = new Map<string, Set<string>>()
  public sockets = { adapter: { rooms: this.rooms } }
  public toEmit = jest.fn()

  use(fn: any) {
    this.middlewares.push(fn)
  }
  on(event: string, handler: any) {
    if (event === 'connection') this.connectionHandlers.push(handler)
  }
  to(room: string) {
    return { emit: (...args: unknown[]) => this.toEmit(room, ...args) }
  }
}

let lastIOInstance: FakeIOServer

jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation(() => {
    lastIOInstance = new FakeIOServer()
    return lastIOInstance
  }),
}))

const mockVerifyAccessToken = jest.fn()
const mockUpdatePriceCache = jest.fn()
const fakePriceCache = new Map<string, any>()

class FakeFinnhubService extends EventEmitter {
  subscribe = jest.fn()
  unsubscribe = jest.fn()
  getQuote = jest.fn()
}
const fakeFinnhubService = new FakeFinnhubService()

const mockEvaluateAlertsForTick = jest.fn()

// The collaborators the composition root injects in production.
const deps = {
  verifyAccessToken: (...args: unknown[]) => mockVerifyAccessToken(...args),
  marketFeed: fakeFinnhubService,
  priceCache: fakePriceCache,
  updatePriceCache: (...args: unknown[]) => mockUpdatePriceCache(...args),
  evaluateAlertsForTick: (...args: unknown[]) =>
    mockEvaluateAlertsForTick(...args),
}

const mockFindUniqueSession = jest.fn()
jest.mock('../../database', () => ({
  prisma: {
    userSession: {
      findUnique: (...args: unknown[]) => mockFindUniqueSession(...args),
    },
  },
}))

const mockLogger = { info: jest.fn(), error: jest.fn() }
jest.mock('../../logger', () => ({ logger: mockLogger }))

const loadSocketServer = (pricingTiersEnabled: boolean) => {
  jest.resetModules()
  fakeFinnhubService.removeAllListeners()
  fakePriceCache.clear()
  jest.doMock('@/config', () => {
    const actual = jest.requireActual('@/config')
    const patched = {
      ...actual.default,
      features: { ...actual.default.features, pricingTiersEnabled },
    }
    return { __esModule: true, default: patched, config: patched }
  })
  return jest.requireActual(
    '../socket-server',
  ) as typeof import('../socket-server')
}

const fakeSocket = (overrides: Record<string, any> = {}) => {
  const handlers: Record<string, (...args: any[]) => any> = {}
  return {
    id: 'sock-1',
    data: {} as Record<string, any>,
    rooms: new Set(['sock-1']),
    handshake: { auth: {} },
    on: jest.fn((event: string, handler: any) => {
      handlers[event] = handler
    }),
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    _handlers: handlers,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('SocketServer — construction', () => {
  it('does not register the auth middleware when pricingTiersEnabled is off', () => {
    const { SocketServer } = loadSocketServer(false)
    new SocketServer({} as any, deps as any)
    expect(lastIOInstance.middlewares).toHaveLength(0)
  })

  it('registers the auth middleware when pricingTiersEnabled is on', () => {
    const { SocketServer } = loadSocketServer(true)
    new SocketServer({} as any, deps as any)
    expect(lastIOInstance.middlewares).toHaveLength(1)
  })

  it('getInstance returns the most recently constructed instance', () => {
    const { SocketServer } = loadSocketServer(false)
    const instance = new SocketServer({} as any, deps as any)
    expect(SocketServer.getInstance()).toBe(instance)
  })
})

describe('SocketServer — authenticateSocket', () => {
  const setup = () => {
    const { SocketServer } = loadSocketServer(true)
    new SocketServer({} as any, deps as any)
    const middleware = lastIOInstance.middlewares[0]
    return middleware
  }

  it('rejects when no token is present', async () => {
    const middleware = setup()
    const next = jest.fn()
    await middleware(fakeSocket({ handshake: { auth: {} } }), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })

  it('rejects when the token has no jti claim', async () => {
    const middleware = setup()
    mockVerifyAccessToken.mockReturnValue({})
    const next = jest.fn()
    await middleware(fakeSocket({ handshake: { auth: { token: 't1' } } }), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })

  it('rejects when the session does not exist', async () => {
    const middleware = setup()
    mockVerifyAccessToken.mockReturnValue({ jti: 'j1' })
    mockFindUniqueSession.mockResolvedValue(null)
    const next = jest.fn()
    await middleware(fakeSocket({ handshake: { auth: { token: 't1' } } }), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })

  it('rejects a revoked session', async () => {
    const middleware = setup()
    mockVerifyAccessToken.mockReturnValue({ jti: 'j1' })
    mockFindUniqueSession.mockResolvedValue({
      isRevoked: true,
      expiresAt: new Date(Date.now() + 100000),
      user: { plan: 'FREE' },
    })
    const next = jest.fn()
    await middleware(fakeSocket({ handshake: { auth: { token: 't1' } } }), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })

  it('rejects an expired session', async () => {
    const middleware = setup()
    mockVerifyAccessToken.mockReturnValue({ jti: 'j1' })
    mockFindUniqueSession.mockResolvedValue({
      isRevoked: false,
      expiresAt: new Date(Date.now() - 1000),
      user: { plan: 'FREE' },
    })
    const next = jest.fn()
    await middleware(fakeSocket({ handshake: { auth: { token: 't1' } } }), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })

  it('accepts a valid session and attaches the plan', async () => {
    const middleware = setup()
    mockVerifyAccessToken.mockReturnValue({ jti: 'j1' })
    mockFindUniqueSession.mockResolvedValue({
      isRevoked: false,
      expiresAt: new Date(Date.now() + 100000),
      user: { plan: 'PRO' },
    })
    const socket = fakeSocket({ handshake: { auth: { token: 't1' } } })
    const next = jest.fn()
    await middleware(socket, next)
    expect(socket.data.plan).toBe('PRO')
    expect(next).toHaveBeenCalledWith()
  })

  it('rejects when token verification throws', async () => {
    const middleware = setup()
    mockVerifyAccessToken.mockImplementation(() => {
      throw new Error('bad token')
    })
    const next = jest.fn()
    await middleware(fakeSocket({ handshake: { auth: { token: 't1' } } }), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('SocketServer — connection handling', () => {
  const connect = (pricingTiersEnabled = false, socketOverrides = {}) => {
    const { SocketServer } = loadSocketServer(pricingTiersEnabled)
    new SocketServer({} as any, deps as any)
    const socket = fakeSocket(socketOverrides)
    lastIOInstance.connectionHandlers[0](socket)
    return socket
  }

  it('logs on connection', () => {
    connect()
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Socket connected'),
    )
  })

  it('joins a user room on Join with a userId', () => {
    const socket = connect()
    socket._handlers['join']('user-1')
    expect(socket.join).toHaveBeenCalledWith('user:user-1')
  })

  it('does nothing on Join with a falsy userId', () => {
    const socket = connect()
    socket._handlers['join']('')
    expect(socket.join).not.toHaveBeenCalled()
  })

  it('emits an error for an invalid subscribe payload', async () => {
    const socket = connect()
    await socket._handlers['subscribe']({ symbol: '' })
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ message: 'Invalid subscribe payload' }),
    )
  })

  it('subscribes a PRO/non-tiered user to the live room and sends a snapshot', async () => {
    const socket = connect(false)
    fakeFinnhubService.getQuote.mockResolvedValue({ c: 150 })
    await socket._handlers['subscribe']({ symbol: 'aapl' })

    expect(socket.join).toHaveBeenCalledWith('AAPL')
    expect(fakeFinnhubService.subscribe).toHaveBeenCalledWith('AAPL')
    expect(socket.emit).toHaveBeenCalledWith(
      'trade',
      expect.objectContaining({ s: 'AAPL', p: 150, snapshot: true }),
    )
    expect(socket.emit).toHaveBeenCalledWith('subscribed', { symbol: 'AAPL' })
  })

  it('subscribes a FREE tiered user to the delayed room and emits plan-restricted', async () => {
    const socket = connect(true, { data: { plan: 'FREE' } })
    fakeFinnhubService.getQuote.mockResolvedValue({ c: 150 })
    await socket._handlers['subscribe']({ symbol: 'tsla' })

    expect(socket.join).toHaveBeenCalledWith('TSLA:delayed')
    expect(socket.emit).toHaveBeenCalledWith(
      'plan_restricted',
      expect.objectContaining({ symbol: 'TSLA' }),
    )
  })

  it('logs and continues when the snapshot fetch fails', async () => {
    const socket = connect(false)
    fakeFinnhubService.getQuote.mockRejectedValue(new Error('down'))
    await socket._handlers['subscribe']({ symbol: 'aapl' })

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error fetching snapshot'),
    )
    expect(socket.emit).toHaveBeenCalledWith('subscribed', { symbol: 'AAPL' })
  })

  it('emits an error for an invalid unsubscribe payload', () => {
    const socket = connect()
    socket._handlers['unsubscribe']({ symbol: '' })
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ message: 'Invalid unsubscribe payload' }),
    )
  })

  it('unsubscribes from Finnhub when no sockets remain in either room', () => {
    const socket = connect()
    socket._handlers['unsubscribe']({ symbol: 'aapl' })

    expect(socket.leave).toHaveBeenCalledWith('AAPL')
    expect(socket.leave).toHaveBeenCalledWith('AAPL:delayed')
    expect(socket.emit).toHaveBeenCalledWith('unsubscribed', { symbol: 'AAPL' })
    expect(fakeFinnhubService.unsubscribe).toHaveBeenCalledWith('AAPL')
  })

  it('keeps the Finnhub subscription alive when other sockets remain in the room', () => {
    const socket = connect()
    lastIOInstance.rooms.set('AAPL', new Set(['other-socket']))
    socket._handlers['unsubscribe']({ symbol: 'aapl' })
    expect(fakeFinnhubService.unsubscribe).not.toHaveBeenCalled()
  })

  it('logs on disconnect', () => {
    const socket = connect()
    socket._handlers['disconnect']('client namespace disconnect')
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Socket disconnected'),
    )
  })

  it('disconnecting: skips its own id room and user rooms, unsubscribes from a now-empty symbol room', () => {
    const socket = connect(false, {
      rooms: new Set(['sock-1', 'user:u1', 'AAPL']),
    })
    lastIOInstance.rooms.set('AAPL', new Set(['sock-1']))
    socket._handlers['disconnecting']()
    expect(fakeFinnhubService.unsubscribe).toHaveBeenCalledWith('AAPL')
  })

  it('disconnecting: leaves the Finnhub subscription alone when other sockets remain in the room', () => {
    const socket = connect(false, { rooms: new Set(['sock-1', 'AAPL']) })
    lastIOInstance.rooms.set('AAPL', new Set(['sock-1', 'other-sock']))
    socket._handlers['disconnecting']()
    expect(fakeFinnhubService.unsubscribe).not.toHaveBeenCalled()
  })

  it('disconnecting: strips the :delayed suffix before checking the underlying symbol', () => {
    const socket = connect(false, {
      rooms: new Set(['sock-1', 'AAPL:delayed']),
    })
    lastIOInstance.rooms.set('AAPL:delayed', new Set(['sock-1']))
    socket._handlers['disconnecting']()
    expect(fakeFinnhubService.unsubscribe).toHaveBeenCalledWith('AAPL')
  })
})

describe('SocketServer — delayed timer broadcast', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('starts a delayed broadcaster once per symbol and emits cached ticks to the delayed room', async () => {
    const { SocketServer } = loadSocketServer(true)
    new SocketServer({} as any, deps as any)
    const socket = fakeSocket({ data: { plan: 'FREE' } })
    lastIOInstance.connectionHandlers[0](socket)
    fakeFinnhubService.getQuote.mockResolvedValue({ c: 1 })

    await socket._handlers['subscribe']({ symbol: 'aapl' })
    await socket._handlers['subscribe']({ symbol: 'aapl' })

    fakePriceCache.set('AAPL', { price: 100, volume: 5 })
    jest.advanceTimersByTime(15 * 60 * 1000)

    expect(lastIOInstance.toEmit).toHaveBeenCalledWith(
      'AAPL:delayed',
      'trade',
      expect.objectContaining({ s: 'AAPL', p: 100, v: 5, delayed: true }),
    )
  })

  it('does not emit when there is no cached price yet', async () => {
    const { SocketServer } = loadSocketServer(true)
    new SocketServer({} as any, deps as any)
    const socket = fakeSocket({ data: { plan: 'FREE' } })
    lastIOInstance.connectionHandlers[0](socket)
    fakeFinnhubService.getQuote.mockResolvedValue({ c: 1 })

    await socket._handlers['subscribe']({ symbol: 'msft' })
    jest.advanceTimersByTime(15 * 60 * 1000)

    expect(lastIOInstance.toEmit).not.toHaveBeenCalled()
  })
})

describe('SocketServer — Finnhub event forwarding', () => {
  it('forwards a trade to the live room, updates the cache, and evaluates alerts', () => {
    const { SocketServer } = loadSocketServer(false)
    new SocketServer({} as any, deps as any)
    mockEvaluateAlertsForTick.mockResolvedValue(undefined)

    fakeFinnhubService.emit('trade', { s: 'aapl', p: 150, v: 10 })

    expect(mockUpdatePriceCache).toHaveBeenCalledWith('AAPL', 150, 10)
    expect(lastIOInstance.toEmit).toHaveBeenCalledWith(
      'AAPL',
      'trade',
      expect.objectContaining({ s: 'aapl' }),
    )
    expect(mockEvaluateAlertsForTick).toHaveBeenCalledWith('AAPL', 150)
  })

  it('defaults volume to 0 when the trade omits it', () => {
    const { SocketServer } = loadSocketServer(false)
    new SocketServer({} as any, deps as any)
    mockEvaluateAlertsForTick.mockResolvedValue(undefined)

    fakeFinnhubService.emit('trade', { s: 'aapl', p: 150 })

    expect(mockUpdatePriceCache).toHaveBeenCalledWith('AAPL', 150, 0)
  })

  it('logs when evaluateAlertsForTick rejects', async () => {
    const { SocketServer } = loadSocketServer(false)
    new SocketServer({} as any, deps as any)
    mockEvaluateAlertsForTick.mockRejectedValue(new Error('eval failed'))

    fakeFinnhubService.emit('trade', { s: 'aapl', p: 150, v: 1 })
    await Promise.resolve()
    await Promise.resolve()

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Unhandled rejection'),
    )
  })

  it('catches a synchronous error while forwarding a malformed trade', () => {
    const { SocketServer } = loadSocketServer(false)
    new SocketServer({} as any, deps as any)

    fakeFinnhubService.emit('trade', null)

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error forwarding trade'),
    )
  })

  it('logs Finnhub WS errors', () => {
    const { SocketServer } = loadSocketServer(false)
    new SocketServer({} as any, deps as any)

    fakeFinnhubService.emit('error', new Error('ws down'))

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Finnhub WS error: ws down'),
    )
  })
})
