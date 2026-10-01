/**
 * Guards against API-doc drift (CLAUDE.md: keep OpenAPI in step with routes).
 * Every route a module registers must appear in the generated spec, and every
 * documented path must still exist as a route. The spec is generated from
 * hand-written tsoa "spec-only" classes, so nothing else ties the two together.
 *
 * Known, deliberate gaps live in the two allowlists below, each with a reason;
 * a new gap fails this test instead of passing silently.
 */
import fs from 'node:fs'
import path from 'node:path'

jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client')
  return {
    ...actual,
    PrismaClient: jest.fn().mockImplementation(() => ({
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      userSession: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    })),
  }
})

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
  })),
)

jest.mock('../modules/market/infrastructure/finnhub-stream', () => ({
  finnhubService: {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    getQuote: jest.fn().mockResolvedValue({ c: 100 }),
  },
}))

import { modules } from '../modules'

/** "METHOD /path" keys with Express `:param` syntax normalised to OpenAPI `{param}`. */
const toKey = (method: string, routePath: string): string =>
  `${method.toUpperCase()} ${routePath
    .replaceAll(/:([A-Za-z0-9_]+)/g, '{$1}')
    .replace(/\/+$/, '')}`

interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> }
}

const registeredRoutes = (): Set<string> => {
  const keys = new Set<string>()
  for (const appModule of modules) {
    const stack = (appModule.router as unknown as { stack: RouterLayer[] })
      .stack
    for (const layer of stack) {
      if (!layer.route) continue
      const routePath = layer.route.path === '/' ? '' : layer.route.path
      for (const method of Object.keys(layer.route.methods)) {
        keys.add(toKey(method, `${appModule.route}${routePath}`))
      }
    }
  }
  return keys
}

const documentedRoutes = (): Set<string> => {
  const specPath = path.resolve(__dirname, '../docs/generated/swagger.json')
  // Defensive: a missing generated spec is a clear failure, not a boot crash.
  if (!fs.existsSync(specPath)) {
    throw new Error('Run `npm run tsoa:spec` to generate swagger.json first')
  }
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8')) as {
    paths: Record<string, Record<string, unknown>>
  }
  const keys = new Set<string>()
  for (const [routePath, operations] of Object.entries(spec.paths)) {
    for (const method of Object.keys(operations)) {
      keys.add(toKey(method, routePath))
    }
  }
  return keys
}

/** Registered but intentionally absent from the spec. */
const UNDOCUMENTED_ALLOWLIST: ReadonlySet<string> = new Set([])

/**
 * Documented routes that are registered only when a feature flag is on
 * (`enablePhoneVerification`, `enablePaymentProcessor`); both are off in the
 * test config, so the walker cannot see them.
 */
const FLAG_GATED_ALLOWLIST: ReadonlySet<string> = new Set([
  'POST /api/v1/auth/phone-verification/request',
  'POST /api/v1/auth/phone-verification/verify',
  'POST /api/v1/payments/create-checkout',
  'GET /api/v1/payments/subscription',
  'POST /api/v1/payments/subscription/auto-renew',
  'POST /api/v1/payments/subscription/renew',
])

describe('OpenAPI spec ↔ registered routes', () => {
  const registered = registeredRoutes()
  const documented = documentedRoutes()

  it('discovers a plausible number of routes (guards the walker itself)', () => {
    expect(registered.size).toBeGreaterThan(100)
    expect(documented.size).toBeGreaterThan(100)
  })

  it('documents every registered route', () => {
    const missing = [...registered]
      .filter((key) => !documented.has(key))
      .filter((key) => !UNDOCUMENTED_ALLOWLIST.has(key))
      .sort((a, b) => a.localeCompare(b))
    expect(missing).toEqual([])
  })

  it('has no documented route that no longer exists', () => {
    const stale = [...documented]
      .filter((key) => !registered.has(key))
      .filter((key) => !FLAG_GATED_ALLOWLIST.has(key))
      .sort((a, b) => a.localeCompare(b))
    expect(stale).toEqual([])
  })
})
