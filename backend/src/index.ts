import dotenv from 'dotenv'

dotenv.config({ quiet: true })
if (process.env.NODE_ENV !== 'development') require('module-alias/register')

import http from 'http'
import { createApp } from './app'
import config from './shared/infrastructure/config/env'
import { startCronScheduler, stopCronScheduler } from './modules/watchlist/infrastructure/scheduler'
import { startNewsCronJobs, stopNewsCronJobs } from './modules/news/infrastructure/news-jobs'
import { connectPrismaWithRetry, prisma } from './shared/infrastructure/database'
import { startEmailWorker, stopEmailWorker } from './modules/notifications/infrastructure/email-worker'
import { closeRedis, connectRedis } from './shared/infrastructure/cache'
import { SocketServer } from './shared/infrastructure/realtime/socket-server'
import { finnhubService } from './modules/market/infrastructure/finnhub-stream'
import { logger } from './shared/infrastructure/logger'

export const httpServer = http.createServer(createApp())

// Infrastructure adapters are started once, at the edge of the monolith.
new SocketServer()

const shutdown = async () => {
  logger.info('Shutdown requested, closing connections...')
  await finnhubService.close()
  await closeRedis()
  stopCronScheduler()
  await stopNewsCronJobs()
  await stopEmailWorker()
  await prisma.$disconnect()
  httpServer.close(() => process.exit(0))
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

const startServer = async () => {
  try {
    httpServer.listen(config.server.port, '0.0.0.0', () => {
      logger.info(`Server listening on port ${config.server.port} in ${config.server.nodeEnv} mode`)
    })

    await connectRedis()
    connectPrismaWithRetry()
    await startCronScheduler()
    await startNewsCronJobs()
    startEmailWorker()
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

void startServer()
