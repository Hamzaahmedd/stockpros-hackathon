import 'dotenv/config'
import { prisma } from '../src/shared/infrastructure/database'

// Synthetic, permanent dev fixtures — never copied from production data.
// Safe to re-run any time (schema change, fresh `dev` branch): every write is
// either an upsert on a natural unique key, or a delete+recreate for models
// with no unique constraint to upsert against (see positions below).
//
// Requires `npm run rbac:seed` to have run first — this script links fixture
// users to the ANALYST/PORTFOLIO_MANAGER/ADMIN roles it creates.

const FIXTURE_EMAIL_DOMAIN = 'stockpros.dev'

type FixtureUserDefinition = {
  slug: string
  displayName: string
  roleName: 'ANALYST' | 'PORTFOLIO_MANAGER' | 'ADMIN'
}

const FIXTURE_USERS: readonly FixtureUserDefinition[] = [
  {
    slug: 'analyst',
    displayName: 'Dev Fixture — Analyst',
    roleName: 'ANALYST',
  },
  {
    slug: 'portfolio-manager',
    displayName: 'Dev Fixture — Portfolio Manager',
    roleName: 'PORTFOLIO_MANAGER',
  },
  {
    slug: 'admin',
    displayName: 'Dev Fixture — Admin',
    roleName: 'ADMIN',
  },
]

const WATCHLIST_SYMBOLS: readonly {
  symbol: string
  targetEntryPrice: number
  stopLoss: number
}[] = [
  { symbol: 'AAPL', targetEntryPrice: 210, stopLoss: 195 },
  { symbol: 'MSFT', targetEntryPrice: 420, stopLoss: 395 },
  { symbol: 'TSLA', targetEntryPrice: 260, stopLoss: 230 },
  { symbol: 'NVDA', targetEntryPrice: 140, stopLoss: 125 },
]

const PORTFOLIO_POSITIONS: readonly {
  symbol: string
  quantity: number
  avgEntryPrice: number
  sector: string
}[] = [
  { symbol: 'AAPL', quantity: 25, avgEntryPrice: 187.5, sector: 'Technology' },
  { symbol: 'MSFT', quantity: 12, avgEntryPrice: 372.1, sector: 'Technology' },
  { symbol: 'JPM', quantity: 30, avgEntryPrice: 198.4, sector: 'Financials' },
]

function fixtureEmail(slug: string): string {
  return `dev-fixture-${slug}@${FIXTURE_EMAIL_DOMAIN}`
}

async function main(): Promise<void> {
  const roles = await prisma.role.findMany({
    where: { name: { in: FIXTURE_USERS.map((u) => u.roleName) } },
  })
  const roleIdByName = new Map(roles.map((r) => [r.name, r.id]))

  for (const def of FIXTURE_USERS) {
    if (!roleIdByName.has(def.roleName)) {
      throw new Error(
        `Role "${def.roleName}" not found — run "npm run rbac:seed" before seeding fixtures.`,
      )
    }
  }

  const users = await Promise.all(
    FIXTURE_USERS.map((def) =>
      prisma.user.upsert({
        where: { email: fixtureEmail(def.slug) },
        update: { displayName: def.displayName },
        create: {
          email: fixtureEmail(def.slug),
          displayName: def.displayName,
        },
      }),
    ),
  )
  const userBySlug = new Map(
    FIXTURE_USERS.map((def, i) => [def.slug, users[i]]),
  )

  await Promise.all(
    FIXTURE_USERS.map((def) => {
      const user = userBySlug.get(def.slug)!
      const roleId = roleIdByName.get(def.roleName)!
      return prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        update: {},
        create: { userId: user.id, roleId, assignedById: user.id },
      })
    }),
  )

  const watchlistUserSlugs = ['analyst', 'portfolio-manager'] as const
  await Promise.all(
    watchlistUserSlugs.flatMap((slug) => {
      const user = userBySlug.get(slug)!
      return WATCHLIST_SYMBOLS.map((item) =>
        prisma.watchlist.upsert({
          where: { userId_symbol: { userId: user.id, symbol: item.symbol } },
          update: {
            targetEntryPrice: item.targetEntryPrice,
            stopLoss: item.stopLoss,
          },
          create: {
            userId: user.id,
            symbol: item.symbol,
            targetEntryPrice: item.targetEntryPrice,
            stopLoss: item.stopLoss,
          },
        }),
      )
    }),
  )

  const portfolioManager = userBySlug.get('portfolio-manager')!
  let portfolio = await prisma.portfolio.findFirst({
    where: { userId: portfolioManager.id },
  })
  if (!portfolio) {
    portfolio = await prisma.portfolio.create({
      data: { userId: portfolioManager.id },
    })
  }

  // Position has no unique constraint to upsert against, so replace the
  // fixture portfolio's positions wholesale each run — still idempotent
  // in effect, since the end state is identical every time.
  await prisma.$transaction([
    prisma.position.deleteMany({ where: { portfolioId: portfolio.id } }),
    prisma.position.createMany({
      data: PORTFOLIO_POSITIONS.map((p) => ({
        portfolioId: portfolio!.id,
        symbol: p.symbol,
        quantity: p.quantity,
        avgEntryPrice: p.avgEntryPrice,
        sector: p.sector,
      })),
    }),
  ])

  process.stdout.write(
    `Seeded ${FIXTURE_USERS.length} dev fixture users, ${watchlistUserSlugs.length * WATCHLIST_SYMBOLS.length} watchlist entries, and ${PORTFOLIO_POSITIONS.length} portfolio positions.\n`,
  )
  process.stdout.write(
    `Fixture logins: ${FIXTURE_USERS.map((u) => fixtureEmail(u.slug)).join(', ')}\n`,
  )
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
