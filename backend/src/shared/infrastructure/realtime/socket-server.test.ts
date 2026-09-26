/**
 * Integration tests for the Socket.IO tier-gating path (SocketServer's
 * `io.use()` auth middleware and the Free/Pro subscribe branching).
 *
 * Strategy: run a real http.Server + Socket.IO server + socket.io-client
 * against localhost on an ephemeral port — no external network involved, so
 * this is safe in a sandboxed CI environment (unlike
 * market/infrastructure/finnhub-stream.test.ts, which requires a live
 * server + real Finnhub streaming and is intentionally excluded from
 * `npm run test:ci`). Only Prisma and the upstream Finnhub client are
 * mocked, mirroring the pattern in app.integration.test.ts and
 * phone-verification.route-registration.test.ts.
 */

jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client')
  return {
    ...actual,
    PrismaClient: jest.fn().mockImplementation(() => ({
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      userSession: { findUnique: jest.fn() },
    })),
  }
})

jest.mock('../../../modules/market/infrastructure/finnhub-stream', () => ({
  finnhubService: {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    on: jest.fn(),
    getQuote: jest.fn().mockResolvedValue({ c: 100 }),
  },
}))

import config from '@/config'
import * as http from 'http'
import jwt from 'jsonwebtoken'
import { AddressInfo } from 'net'
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client'
import { prisma } from '../database'
import { SocketServer } from './socket-server'

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET as string

function signToken(jti: string): string {
  return jwt.sign({ sub: 'user-1', jti }, ACCESS_TOKEN_SECRET, {
    expiresIn: '1h',
  })
}

function mockSession(overrides?: {
  isRevoked?: boolean
  expiresAt?: Date
  plan?: 'FREE' | 'PRO'
}) {
  ;(prisma.userSession.findUnique as jest.Mock).mockResolvedValue({
    isRevoked: overrides?.isRevoked ?? false,
    expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    user: { plan: overrides?.plan ?? 'FREE' },
  })
}

async function startServer(): Promise<{
  httpServer: http.Server
  socketServer: SocketServer
  port: number
}> {
  const httpServer = http.createServer()
  const socketServer = new SocketServer(httpServer)
  await new Promise<void>((resolve) => httpServer.listen(0, resolve))
  const port = (httpServer.address() as AddressInfo).port
  return { httpServer, socketServer, port }
}

function connectClient(port: number, token?: string): ClientSocket {
  return ioClient(`http://localhost:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    auth: token ? { token } : undefined,
    forceNew: true,
  })
}

describe('SocketServer tier gating', () => {
  let httpServer: http.Server | undefined
  let socketServer: SocketServer | undefined
  let client: ClientSocket | undefined

  afterEach(async () => {
    client?.disconnect()
    client = undefined
    // Closing only the raw http.Server leaves Socket.IO's own engine.io
    // heartbeat timers running — close the io layer itself first so Jest
    // doesn't have to force-exit the worker.
    if (socketServer) {
      await new Promise<void>((resolve) =>
        socketServer!.io.close(() => resolve()),
      )
      socketServer = undefined
    }
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()))
      httpServer = undefined
    }
    jest.clearAllMocks()
    ;(config.features as any).pricingTiersEnabled = false
  })

  it('pricingTiersEnabled=false: accepts a connection with no auth token at all (current default behavior, unchanged)', async () => {
    ;(config.features as any).pricingTiersEnabled = false
    const started = await startServer()
    httpServer = started.httpServer
    socketServer = started.socketServer

    client = connectClient(started.port)
    await new Promise<void>((resolve, reject) => {
      client!.on('connect', () => resolve())
      client!.on('connect_error', reject)
    })

    expect(client.connected).toBe(true)
  })

  it('pricingTiersEnabled=true: rejects a connection with no token', async () => {
    ;(config.features as any).pricingTiersEnabled = true
    const started = await startServer()
    httpServer = started.httpServer
    socketServer = started.socketServer

    client = connectClient(started.port)
    await new Promise<void>((resolve) => {
      client!.on('connect_error', () => resolve())
      client!.on('connect', () => resolve())
    })

    expect(client.connected).toBe(false)
  })

  it('pricingTiersEnabled=true: rejects a connection whose session is revoked', async () => {
    ;(config.features as any).pricingTiersEnabled = true
    mockSession({ isRevoked: true })
    const started = await startServer()
    httpServer = started.httpServer
    socketServer = started.socketServer

    client = connectClient(started.port, signToken('jti-revoked'))
    await new Promise<void>((resolve) => {
      client!.on('connect_error', () => resolve())
      client!.on('connect', () => resolve())
    })

    expect(client.connected).toBe(false)
  })

  it('pricingTiersEnabled=true: accepts a valid FREE-plan session and marks the subscribe as plan-restricted', async () => {
    ;(config.features as any).pricingTiersEnabled = true
    mockSession({ plan: 'FREE' })
    const started = await startServer()
    httpServer = started.httpServer
    socketServer = started.socketServer

    client = connectClient(started.port, signToken('jti-free'))
    await new Promise<void>((resolve, reject) => {
      client!.on('connect', () => resolve())
      client!.on('connect_error', reject)
    })
    expect(client.connected).toBe(true)

    const restricted = new Promise((resolve) =>
      client!.on('plan_restricted', resolve),
    )
    client.emit('subscribe', { symbol: 'AAPL' })

    await expect(restricted).resolves.toMatchObject({
      feature: 'realtime_quotes',
      symbol: 'AAPL',
    })
  })

  it('pricingTiersEnabled=true: accepts a valid PRO-plan session and does not restrict the subscribe', async () => {
    ;(config.features as any).pricingTiersEnabled = true
    mockSession({ plan: 'PRO' })
    const started = await startServer()
    httpServer = started.httpServer
    socketServer = started.socketServer

    client = connectClient(started.port, signToken('jti-pro'))
    await new Promise<void>((resolve, reject) => {
      client!.on('connect', () => resolve())
      client!.on('connect_error', reject)
    })

    let restricted = false
    client.on('plan_restricted', () => {
      restricted = true
    })

    const subscribed = new Promise((resolve) =>
      client!.on('subscribed', resolve),
    )
    client.emit('subscribe', { symbol: 'AAPL' })
    await expect(subscribed).resolves.toMatchObject({ symbol: 'AAPL' })

    expect(restricted).toBe(false)
  })
})
