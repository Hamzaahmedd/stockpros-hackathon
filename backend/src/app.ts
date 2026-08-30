import config from '@/config'
import cookieParser from 'cookie-parser'
import express from 'express'
import { modules } from './modules'
import { NotFoundError } from './shared/errors'
import { setupSwaggerDocs } from './shared/infrastructure/docs'
import { healthCheckHandler } from './shared/infrastructure/health'
import { errorHandler, securityMiddleware } from './shared/middlewares'

/** Creates the HTTP application without opening sockets or starting workers. */
export const createApp = () => {
  const app = express()
  app.set('trust proxy', 1)
  securityMiddleware(app)
  app.use(express.json())
  app.use(cookieParser())

  // Public infrastructure health check endpoint
  app.get('/health', healthCheckHandler)

  if (config.features.enableSwaggerDocs) {
    setupSwaggerDocs(app)
  }

  for (const module of modules) app.use(module.route, module.router)

  app.get('/', (_req, res) => res.send('StockPros server is running'))
  app.use((req) => {
    throw new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`)
  })
  app.use(errorHandler)
  return app
}
