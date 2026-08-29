import dotenv from 'dotenv'

dotenv.config({ quiet: true })
if (process.env.NODE_ENV !== 'development') require('module-alias/register')

import config from '@/config'
import http from 'http'
import { createApp } from './app'
import { finnhubService } from './modules/market/infrastructure/finnhub-stream'
import {
  startNewsCronJobs,
  stopNewsCronJobs,
} from './modules/news/infrastructure/news-jobs'
import {
  startAuthEmailWorker,
  stopAuthEmailWorker,
} from './modules/notifications/infrastructure/auth-email-worker'
import {
  startEmailWorker,
  stopEmailWorker,
} from './modules/notifications/infrastructure/email-worker'
import {
  startCronScheduler,
  stopCronScheduler,
} from './modules/watchlist/infrastructure/scheduler'
import { closeRedis, connectRedis } from './shared/infrastructure/cache'
import {
  connectPrismaWithRetry,
  prisma,
} from './shared/infrastructure/database'
import { logger } from './shared/infrastructure/logger'
import { SocketServer } from './shared/infrastructure/realtime/socket-server'

export const httpServer = http.createServer(createApp())

// Infrastructure adapters are started once, at the edge of the monolith.
new SocketServer(httpServer)

const shutdown = async () => {
  logger.info('Shutdown requested, closing connections...')
  await finnhubService.close()
  await closeRedis()
  stopCronScheduler()
  await stopNewsCronJobs()
  await stopEmailWorker()
  await stopAuthEmailWorker()
  await prisma.$disconnect()
  httpServer.close(() => process.exit(0))
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

const startServer = async () => {
  try {
    httpServer.listen(config.server.port, '0.0.0.0', () => {
      logger.info(
        `Server listening on port ${config.server.port} in ${config.server.nodeEnv} mode`,
      )
    })

    await connectRedis()
    connectPrismaWithRetry()
    await startCronScheduler()
    await startNewsCronJobs()
    startEmailWorker()
    startAuthEmailWorker()
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

void startServer()
