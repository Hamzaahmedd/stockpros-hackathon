import config from '@/config'
import type { PlanTier } from '@prisma/client'
import * as http from 'http'
import { Server as IOServer, Socket as BaseSocket } from 'socket.io'
import { verifyAccessToken } from '../../../modules/auth/utils/jwt'
import {
  priceCache,
  updatePriceCache,
} from '../../../modules/market/caches/price-cache'
import { finnhubService } from '../../../modules/market/infrastructure/finnhub-stream'
import { evaluateAlertsForTick } from '../../../modules/watchlist/evaluators/alert-evaluator'
import { prisma } from '../database'
import { logger } from '../logger'
import { SocketEvent } from './socket-events'
import { socketSubscribeValidator } from './subscription-validation'

const DELAYED_REFRESH_MS = 15 * 60 * 1000
const DELAYED_ROOM_SUFFIX = ':delayed'
const delayedRoom = (symbol: string) => `${symbol}${DELAYED_ROOM_SUFFIX}`

interface SocketData {
  plan?: PlanTier
}

type Socket = BaseSocket<any, any, any, SocketData>

export class SocketServer {
  private static instance: SocketServer
  public io: IOServer
  private readonly delayedTimers = new Map<string, NodeJS.Timeout>()

  constructor(server: http.Server) {
    this.io = new IOServer(server, {
      cors: {
        origin: config.server.frontendUrl,
        methods: ['GET', 'POST'],
      },
    })

    this.initialize()
    SocketServer.instance = this
  }

  public static getInstance(): SocketServer {
    return SocketServer.instance
  }

  private initialize(): void {
    if (config.features.pricingTiersEnabled) {
      this.io.use((socket, next) => this.authenticateSocket(socket, next))
    }
    this.handleConnections()
    this.handleFinnhubEvents()
    this.handleFinnhubErrors()
  }

  /**
   * Only wired up when pricingTiersEnabled is on — leaves the socket server's
   * current (unauthenticated, everyone-gets-live-ticks) behavior fully intact
   * when the flag is off, so this isn't a silent security change to the
   * RBAC-mode default.
   */
  private async authenticateSocket(
    socket: Socket,
    next: (err?: Error) => void,
  ): Promise<void> {
    try {
      const token = socket.handshake.auth?.token as string | undefined
      if (!token) return next(new Error('Unauthorized'))

      const payload = verifyAccessToken(token, config.auth.accessTokenSecret)
      if (!payload.jti) return next(new Error('Unauthorized'))

      const session = await prisma.userSession.findUnique({
        where: { jti: payload.jti },
        include: { user: { select: { plan: true } } },
      })
      if (!session || session.isRevoked || new Date() > session.expiresAt) {
        return next(new Error('Unauthorized'))
      }

      socket.data.plan = session.user.plan
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  }

  private handleConnections(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Socket connected: ${socket.id}`)

      // Handle user joining a private room for notifications
      socket.on(SocketEvent.Join, (userId: string) => {
        if (userId) {
          socket.join(`user:${userId}`)
          logger.info(`Socket ${socket.id} joined user room: user:${userId}`)
        }
      })

      socket.on(SocketEvent.Subscribe, (payload: unknown) =>
        this.handleSubscribe(socket, payload),
      )
      socket.on(SocketEvent.Unsubscribe, (payload: unknown) =>
        this.handleUnsubscribe(socket, payload),
      )
      socket.on('disconnecting', () => this.handleDisconnecting(socket))
      socket.on('disconnect', (reason) => this.handleDisconnect(socket, reason))
    })
  }

  private isFreeTier(socket: Socket): boolean {
    return config.features.pricingTiersEnabled && socket.data.plan !== 'PRO'
  }

  private async handleSubscribe(
    socket: Socket,
    payload: unknown,
  ): Promise<void> {
    const parsed = socketSubscribeValidator.safeParse(payload)
    if (!parsed.success) {
      socket.emit(SocketEvent.Error, {
        message: 'Invalid subscribe payload',
        issues: parsed.error.issues,
      })
      return
    }

    const symbol = parsed.data.symbol.toUpperCase()
    const free = this.isFreeTier(socket)

    if (free) {
      socket.join(delayedRoom(symbol))
      this.ensureDelayedTimer(symbol)
      socket.emit(SocketEvent.PlanRestricted, {
        feature: 'realtime_quotes',
        symbol,
      })
    } else {
      socket.join(symbol)
    }

    // Subscribe to Finnhub WS — shared upstream feed backs both the live and
    // delayed rooms for this symbol.
    finnhubService.subscribe(symbol)

    // Send initial snapshot quote
    try {
      const snapshot = await finnhubService.getQuote(symbol)
      socket.emit(SocketEvent.Trade, {
        s: symbol,
        p: snapshot.c,
        v: 0,
        snapshot: true,
      })
      logger.info(`Snapshot sent for ${symbol} to socket ${socket.id}`)
    } catch (err) {
      logger.error(
        `Error fetching snapshot for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    socket.emit(SocketEvent.Subscribed, { symbol })
    logger.info(
      `Socket ${socket.id} joined room ${free ? delayedRoom(symbol) : symbol}`,
    )
  }

  /** Starts the ~15-minute delayed-quote broadcaster for a symbol, once per symbol. */
  private ensureDelayedTimer(symbol: string): void {
    if (this.delayedTimers.has(symbol)) return
    const timer = setInterval(() => {
      const cached = priceCache.get(symbol)
      if (!cached) return
      this.io.to(delayedRoom(symbol)).emit(SocketEvent.Trade, {
        s: symbol,
        p: cached.price,
        v: cached.volume,
        delayed: true,
      })
    }, DELAYED_REFRESH_MS)
    timer.unref?.()
    this.delayedTimers.set(symbol, timer)
  }

  private clearDelayedTimerIfEmpty(symbol: string): void {
    const room = this.io.sockets.adapter.rooms.get(delayedRoom(symbol))
    if (room && room.size > 0) return
    const timer = this.delayedTimers.get(symbol)
    if (timer) {
      clearInterval(timer)
      this.delayedTimers.delete(symbol)
    }
  }

  /** Combined live + delayed subscriber count — the real signal for whether Finnhub still needs this symbol. */
  private totalSubscriberCount(symbol: string): number {
    const live = this.io.sockets.adapter.rooms.get(symbol)?.size ?? 0
    const delayed =
      this.io.sockets.adapter.rooms.get(delayedRoom(symbol))?.size ?? 0
    return live + delayed
  }

  private handleUnsubscribe(socket: Socket, payload: unknown): void {
    const parsed = socketSubscribeValidator.safeParse(payload)
    if (!parsed.success) {
      socket.emit(SocketEvent.Error, {
        message: 'Invalid unsubscribe payload',
        issues: parsed.error.issues,
      })
      return
    }

    const symbol = parsed.data.symbol.toUpperCase()
    socket.leave(symbol)
    socket.leave(delayedRoom(symbol))
    socket.emit(SocketEvent.Unsubscribed, { symbol })
    logger.info(`Socket ${socket.id} left room ${symbol}`)

    this.clearDelayedTimerIfEmpty(symbol)
    if (this.totalSubscriberCount(symbol) === 0) {
      finnhubService.unsubscribe(symbol)
      logger.info(`Unsubscribed ${symbol} from Finnhub (no active sockets)`)
    }
  }

  private handleDisconnecting(socket: Socket): void {
    const rooms = Array.from(socket.rooms)
    for (const room of rooms) {
      if (room === socket.id || room.startsWith('user:')) continue

      const symbol = room.endsWith(DELAYED_ROOM_SUFFIX)
        ? room.slice(0, -DELAYED_ROOM_SUFFIX.length)
        : room
      const roomSet = this.io.sockets.adapter.rooms.get(room)
      const roomSize = roomSet ? roomSet.size : 0
      // If this socket is the only one left in the room, size will be 1
      if (roomSize > 1) continue

      this.clearDelayedTimerIfEmpty(symbol)
      if (this.totalSubscriberCount(symbol) <= 1) {
        finnhubService.unsubscribe(symbol)
        logger.info(
          `Unsubscribed ${symbol} from Finnhub (no active sockets after disconnect)`,
        )
      }
    }
  }

  private handleDisconnect(socket: Socket, reason: string): void {
    logger.info(`Socket disconnected ${socket.id} reason=${reason}`)
  }

  // REPLACE handleFinnhubEvents with this:
  private handleFinnhubEvents(): void {
    finnhubService.on('trade', (trade) => {
      try {
        const symbol = String(trade.s).toUpperCase()
        updatePriceCache(symbol, trade.p, trade.v ?? 0) // M2 — already there
        this.io.to(symbol).emit(SocketEvent.Trade, trade) // already there

        // M6: Evaluate alert rules for this tick — fire-and-forget,
        // errors are caught inside evaluateAlertsForTick so the pipeline
        // is never blocked or crashed
        evaluateAlertsForTick(symbol, trade.p).catch((err) =>
          logger.error('[AlertEvaluator] Unhandled rejection: ' + err.message),
        )
      } catch (err) {
        logger.error('Error forwarding trade: ' + (err as Error).message)
      }
    })
  }

  private handleFinnhubErrors(): void {
    finnhubService.on('error', (err) => {
      logger.error('Finnhub WS error: ' + (err as Error).message)
    })
  }
}
