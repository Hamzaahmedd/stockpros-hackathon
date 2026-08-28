import cookieParser from 'cookie-parser'
import express from 'express'
import { NotFoundError } from './shared/errors'
import { errorHandler, securityMiddleware } from './shared/middlewares'
import { modules } from './modules'
import { evaluateAlertForDevelopment } from './modules/watchlist'

/** Creates the HTTP application without opening sockets or starting workers. */
export const createApp = () => {
  const app = express()
  app.set('trust proxy', 1)
  securityMiddleware(app)
  app.use(express.json())
  app.use(cookieParser())

  for (const module of modules) app.use(module.route, module.router)

  app.post('/api/v1/dev/trigger-alert', async (req, res) => {
    const { symbol, price, skipCooldown } = req.body
    await evaluateAlertForDevelopment(symbol, parseFloat(price), skipCooldown)
    res.json({ message: `Evaluated alerts for ${symbol} @ ${price}` })
  })

  app.get('/', (_req, res) => res.send('Stock App server is running'))
  app.use((req) => {
    throw new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`)
  })
  app.use(errorHandler)
  return app
}
