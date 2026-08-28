import { Server as IOServer, Socket } from 'socket.io'
import { httpServer } from '../../..'
import { updatePriceCache } from '../../../modules/market/caches/price-cache'
import { finnhubService } from '../../../modules/market/infrastructure/finnhub-stream'
import { evaluateAlertsForTick } from '../../../modules/watchlist/evaluators/alert-evaluator'
import config from '../config/env'
import { logger } from '../logger'
import { socketSubscribeValidator } from './subscription-validation'

export class SocketServer {
  private static instance: SocketServer
  public io: IOServer

  constructor() {
    this.io = new IOServer(httpServer, {
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
    this.handleConnections()
    this.handleFinnhubEvents()
    this.handleFinnhubErrors()
  }

  private handleConnections(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Socket connected: ${socket.id}`)

      // Handle user joining a private room for notifications
      socket.on('join', (userId: string) => {
        if (userId) {
          socket.join(`user:${userId}`)
          logger.info(`Socket ${socket.id} joined user room: user:${userId}`)
        }
      })

      socket.on('subscribe', (payload) => this.handleSubscribe(socket, payload))
      socket.on('unsubscribe', (payload) =>
        this.handleUnsubscribe(socket, payload),
      )
      socket.on('disconnecting', () => this.handleDisconnecting(socket))
      socket.on('disconnect', (reason) => this.handleDisconnect(socket, reason))
    })
  }

  private async handleSubscribe(
    socket: Socket,
    payload: unknown,
  ): Promise<void> {
    const parsed = socketSubscribeValidator.safeParse(payload)
    if (!parsed.success) {
      socket.emit('error', {
        message: 'Invalid subscribe payload',
        issues: parsed.error.issues,
      })
      return
    }

    const symbol = parsed.data.symbol.toUpperCase()
    socket.join(symbol)

    // Subscribe to Finnhub WS
    finnhubService.subscribe(symbol)

    // Send initial snapshot quote
    try {
      const snapshot = await finnhubService.getQuote(symbol)
      socket.emit('trade', {
        s: symbol,
        p: snapshot.c,
        v: 0,
        snapshot: true,
      })
      logger.info(`Snapshot sent for ${symbol} to socket ${socket.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`Error fetching snapshot for ${symbol}: ${message}`)
    }

    socket.emit('subscribed', { symbol })
    logger.info(`Socket ${socket.id} joined room ${symbol}`)
  }

  private handleUnsubscribe(socket: Socket, payload: unknown): void {
    const parsed = socketSubscribeValidator.safeParse(payload)
    if (!parsed.success) {
      socket.emit('error', {
        message: 'Invalid unsubscribe payload',
        issues: parsed.error.issues,
      })
      return
    }

    const symbol = parsed.data.symbol.toUpperCase()
    socket.leave(symbol)
    socket.emit('unsubscribed', { symbol })
    logger.info(`Socket ${socket.id} left room ${symbol}`)

    const room = this.io.sockets.adapter.rooms.get(symbol)
    const roomSize = room ? room.size : 0
    if (roomSize === 0) {
      finnhubService.unsubscribe(symbol)
      logger.info(`Unsubscribed ${symbol} from Finnhub (no active sockets)`)
    }
  }

  private handleDisconnecting(socket: Socket): void {
    const rooms = Array.from(socket.rooms)
    for (const room of rooms) {
      if (room !== socket.id && !room.startsWith('user:')) {
        const roomSet = this.io.sockets.adapter.rooms.get(room)
        const roomSize = roomSet ? roomSet.size : 0
        // If this socket is the only one left in the room, size will be 1
        if (roomSize <= 1) {
          finnhubService.unsubscribe(room)
          logger.info(`Unsubscribed ${room} from Finnhub (no active sockets after disconnect)`)
        }
      }
    }
  }

  private handleDisconnect(socket: Socket, reason: string): void {
    logger.info(`Socket disconnected ${socket.id} reason=${reason}`)
  }

  // REPLACE handleFinnhubEvents with this:
  private handleFinnhubEvents(): void {
    finnhubService.on("trade", (trade) => {
      try {
        const symbol = String(trade.s).toUpperCase();
        updatePriceCache(symbol, trade.p, trade.v ?? 0);    // M2 — already there
        this.io.to(symbol).emit("trade", trade);             // already there

        // M6: Evaluate alert rules for this tick — fire-and-forget,
        // errors are caught inside evaluateAlertsForTick so the pipeline
        // is never blocked or crashed
        evaluateAlertsForTick(symbol, trade.p).catch((err) =>
          logger.error("[AlertEvaluator] Unhandled rejection: " + err.message),
        );
      } catch (err) {
        logger.error("Error forwarding trade: " + (err as Error).message);
      }
    });
  }

  private handleFinnhubErrors(): void {
    finnhubService.on('error', (err) => {
      logger.error('Finnhub WS error: ' + (err as Error).message)
    })
  }
}
