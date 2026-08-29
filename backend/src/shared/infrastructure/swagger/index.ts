/**
 * OpenAPI / Swagger documentation bootstrap.
 *
 * The spec is assembled at runtime from JSDoc annotations that live
 * alongside each module's route file (via swagger-jsdoc) and served
 * through swagger-ui-express at /api-docs.
 *
 * Documentation is **gated by configuration** — set `enableSwaggerDocs`
 * in the environment config (or ENABLE_SWAGGER_DOCS=true in .env) to
 * turn the endpoint on.  It defaults to `true` in development and
 * `false` in production / test.
 */
import type { Application, Request, Response, NextFunction } from 'express'
import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'
import config from '@/config'
import { logger } from '@/shared/infrastructure/logger'

// ─── OpenAPI 3.0 base specification ─────────────────────────────────────────

const swaggerDefinition: swaggerJsdoc.Options['definition'] = {
  openapi: '3.0.0',
  info: {
    title: 'StockPros API',
    version: '1.0.0',
    description:
      'REST API for the StockPros AI-powered stock forecasting, portfolio analytics, ' +
      'and decision-support platform.  All protected endpoints require a valid JWT ' +
      'Bearer token in the Authorization header.',
    contact: {
      name: 'StockPros Engineering',
    },
  },
  servers: [
    {
      url: `http://localhost:${config.server.port}`,
      description: 'Local development server',
    },
    {
      url: 'https://api.stockpros.dev',
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Paste the JWT access token received from the auth endpoints. ' +
          'Example: `Bearer eyJhbGci…`',
      },
      CookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'refresh_token',
        description:
          'Refresh-token cookie set automatically by the auth endpoints. ' +
          'Used only by /auth/refresh-token.',
      },
    },
    schemas: {
      // ─── Shared response envelopes ───────────────────────────────────
      SuccessEnvelope: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: { type: 'object' },
        },
      },
      ErrorEnvelope: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          statusCode: { type: 'integer' },
          details: { type: 'object' },
          errorCode: { type: 'string' },
        },
      },
    },
  },
  // Apply bearer auth globally — individual paths can opt-out via security: [].
  security: [{ BearerAuth: [] }],
}

const options: swaggerJsdoc.Options = {
  definition: swaggerDefinition,
  // Scan JSDoc blocks in every module's route file.
  apis: [
    // Resolved paths work both in dev (ts-node) and production (dist/).
    `${__dirname}/../../../modules/**/routes.{ts,js}`,
    `${__dirname}/../../../modules/**/validation.{ts,js}`,
    // Public health probe lives in shared infrastructure, not a module.
    `${__dirname}/../health.{ts,js}`,
  ],
}

// ─── Public helpers ──────────────────────────────────────────────────────────

/** Returns the generated OpenAPI spec object (useful for debugging). */
export const getOpenApiSpec = (): object => swaggerJsdoc(options)

/**
 * Mounts Swagger UI at `/api-docs` when documentation is enabled.
 * Call this once during application bootstrap (inside `createApp`).
 */
export const setupSwaggerDocs = (app: Application): void => {
  const enabled =
    process.env.ENABLE_SWAGGER_DOCS !== undefined
      ? process.env.ENABLE_SWAGGER_DOCS === 'true'
      : config.features.enableSwaggerDocs

  if (!enabled) {
    logger.info('Swagger documentation is disabled for this environment.')
    return
  }

  const spec = swaggerJsdoc(options)

  // Helmet's default CSP blocks the inline scripts/styles Swagger UI needs.
  // Strip the CSP header only for responses served under /api-docs.
  const stripCsp = (_req: Request, res: Response, next: NextFunction): void => {
    res.removeHeader('Content-Security-Policy')
    res.removeHeader('X-Content-Security-Policy')
    next()
  }

  app.use('/api-docs', stripCsp, swaggerUi.serve, swaggerUi.setup(spec, {
    customSiteTitle: 'StockPros API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
    },
  }))

  // Also expose the raw JSON spec for tooling (e.g. code-gen, Postman).
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.send(spec)
  })

  logger.info('Swagger UI available at /api-docs')
}
