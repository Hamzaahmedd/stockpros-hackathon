import cookieParser from 'cookie-parser'
import express from 'express'
import { modules } from './modules'
import { NotFoundError } from './shared/errors'
import { errorHandler, securityMiddleware } from './shared/middlewares'

/** Creates the HTTP application without opening sockets or starting workers. */
export const createApp = () => {
  const app = express()
  app.set('trust proxy', 1)
  securityMiddleware(app)
  app.use(express.json())
  app.use(cookieParser())

  for (const module of modules) app.use(module.route, module.router)

  app.get('/', (_req, res) => res.send('StockPros server is running'))
  app.use((req) => {
    throw new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`)
  })
  app.use(errorHandler)
  return app
}
