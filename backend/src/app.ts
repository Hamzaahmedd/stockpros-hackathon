import cookieParser from 'cookie-parser'
import express from 'express'
import { modules } from './modules'
import { NotFoundError } from './shared/errors'
import { errorHandler, securityMiddleware } from './shared/middlewares'
import { healthRouter } from './shared/infrastructure/health'
import { setupSwaggerDocs } from './shared/infrastructure/swagger'

/** Creates the HTTP application without opening sockets or starting workers. */
export const createApp = () => {
  const app = express()
  app.set('trust proxy', 1)

  // Public health probe — mounted before every request-scoped middleware
  // (rate limiting, CORS, body parsing) so uptime monitors poll freely and
  // the endpoint is never captured by analytics/audit middleware.
  app.use('/health', healthRouter)

  securityMiddleware(app)
  app.use(express.json())
  app.use(cookieParser())

  // Mount OpenAPI interactive documentation (gated by environment config).
  setupSwaggerDocs(app)

  for (const module of modules) app.use(module.route, module.router)

  app.get('/', (_req, res) => res.send('StockPros server is running'))
  app.use((req) => {
    throw new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`)
  })
  app.use(errorHandler)
  return app
}
