/**
 * Concurrency proof for consumeAiSignal. The Postgres behaviour that matters
 * (advisory locks serialising transactions) is modelled by an in-memory fake:
 * a FIFO mutex per lock key, with deliberate delays between every read and
 * write so an unlocked implementation reliably interleaves. The control tests
 * run the *same* workload without the mutex and must overshoot — proving the
 * harness can actually see the race the lock is there to prevent.
 */
let mockPrisma: any

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

import { OverageRequiredError } from '../../../shared/errors'
import {
  MeteredFeature,
  OVERAGE_COST_PAISA_PER_SIGNAL,
  PRO_MONTHLY_AI_SIGNALS,
} from '../constants'
import { consumeAiSignal, UsageSource } from '../credits'

const tick = () => new Promise((resolve) => setImmediate(resolve))

interface FakeDb {
  client: any
  usageRows: { userId: string; costPaisa: number }[]
  ledgerRows: number[]
  balances: Map<string, number>
}

/** `useLocks: false` turns `pg_advisory_xact_lock` into a no-op (a plain READ COMMITTED transaction). */
const makeFakeDb = (useLocks: boolean): FakeDb => {
  const usageRows: FakeDb['usageRows'] = []
  const ledgerRows: number[] = []
  const balances = new Map<string, number>()
  const tails = new Map<string, Promise<void>>()

  const acquire = async (key: string): Promise<() => void> => {
    const previous = tails.get(key) ?? Promise.resolve()
    let release!: () => void
    const mine = new Promise<void>((resolve) => (release = resolve))
    tails.set(
      key,
      previous.then(() => mine),
    )
    await previous
    return release
  }

  const makeTx = (held: (() => void)[]) => ({
    // Tagged template: (strings, ...values) — the value is the lock key.
    $executeRaw: async (_strings: TemplateStringsArray, key: string) => {
      if (useLocks) held.push(await acquire(key))
    },
    usageEvent: {
      count: async ({ where }: any) => {
        const n = usageRows.filter((r) => r.userId === where.userId).length
        await tick() // read → (other transactions run here) → write
        return n
      },
      create: async ({ data }: any) => {
        await tick()
        usageRows.push({ userId: data.userId, costPaisa: data.costPaisa })
      },
    },
    creditLedger: {
      aggregate: async () => ({ _sum: { amountPaisa: null } }),
      create: async ({ data }: any) => {
        await tick()
        ledgerRows.push(data.amountPaisa)
      },
    },
    user: {
      updateMany: async ({ where, data }: any) => {
        await tick()
        const balance = balances.get(where.id) ?? 0
        if (balance < where.creditBalanceInPaisa.gte) return { count: 0 }
        balances.set(where.id, balance - data.creditBalanceInPaisa.decrement)
        return { count: 1 }
      },
    },
    team: { updateMany: jest.fn() },
  })

  const client = {
    subscription: { findUnique: async () => null },
    $transaction: async (fn: (tx: any) => Promise<unknown>) => {
      const held: (() => void)[] = []
      try {
        return await fn(makeTx(held))
      } finally {
        held.forEach((release) => release()) // commit/rollback releases xact locks
      }
    },
  }
  return { client, usageRows, ledgerRows, balances }
}

const actor = { userId: 'user-1', membership: null }

const runBurst = async (db: FakeDb, requests: number) => {
  mockPrisma = db.client
  return Promise.allSettled(
    Array.from({ length: requests }, () =>
      consumeAiSignal(actor, MeteredFeature.AI_FORECAST, 'AAPL'),
    ),
  )
}

const summarize = (results: PromiseSettledResult<unknown>[]) => ({
  base: results.filter(
    (r) =>
      r.status === 'fulfilled' && (r.value as any).source === UsageSource.BASE,
  ).length,
  credit: results.filter(
    (r) =>
      r.status === 'fulfilled' &&
      (r.value as any).source === UsageSource.CREDIT,
  ).length,
  rejected: results.filter(
    (r) => r.status === 'rejected' && r.reason instanceof OverageRequiredError,
  ).length,
})

const NEAR_LIMIT = PRO_MONTHLY_AI_SIGNALS - 5 // 295 used, 5 base signals left

const seed = (db: FakeDb, balance: number) => {
  for (let i = 0; i < NEAR_LIMIT; i += 1) {
    db.usageRows.push({ userId: 'user-1', costPaisa: 0 })
  }
  db.balances.set('user-1', balance)
}

describe('quota boundary under a concurrent burst', () => {
  it('with the per-user lock, exactly the remaining base signals are free — no overshoot', async () => {
    const db = makeFakeDb(true)
    seed(db, 1_000_000)

    const outcome = summarize(await runBurst(db, 20))

    expect(outcome).toEqual({ base: 5, credit: 15, rejected: 0 })
    // 295 + 5 free + 15 paid = 315 usage rows; each paid one cost exactly one signal.
    expect(db.usageRows).toHaveLength(NEAR_LIMIT + 20)
    expect(db.usageRows.filter((r) => r.costPaisa > 0)).toHaveLength(15)
    expect(db.ledgerRows).toEqual(
      Array(15).fill(-OVERAGE_COST_PAISA_PER_SIGNAL),
    )
    expect(db.balances.get('user-1')).toBe(
      1_000_000 - 15 * OVERAGE_COST_PAISA_PER_SIGNAL,
    )
  })

  it('CONTROL — the same burst without the lock overshoots, so the harness does detect the race', async () => {
    const db = makeFakeDb(false)
    seed(db, 1_000_000)

    const outcome = summarize(await runBurst(db, 20))

    expect(outcome.base).toBeGreaterThan(5)
  })

  it('never overdraws the balance: with credit for only 3 more signals, exactly 3 succeed and the rest are rejected', async () => {
    const db = makeFakeDb(true)
    seed(db, 3 * OVERAGE_COST_PAISA_PER_SIGNAL)
    // Exhaust base quota too, so every request needs credit.
    for (let i = 0; i < 5; i += 1)
      db.usageRows.push({ userId: 'user-1', costPaisa: 0 })

    const outcome = summarize(await runBurst(db, 12))

    expect(outcome).toEqual({ base: 0, credit: 3, rejected: 9 })
    expect(db.balances.get('user-1')).toBe(0)
    expect(db.ledgerRows).toHaveLength(3)
  })

  it('rejected requests leave no usage row behind (the transaction writes nothing)', async () => {
    const db = makeFakeDb(true)
    seed(db, 0)
    for (let i = 0; i < 5; i += 1)
      db.usageRows.push({ userId: 'user-1', costPaisa: 0 })
    const before = db.usageRows.length

    const outcome = summarize(await runBurst(db, 6))

    expect(outcome.rejected).toBe(6)
    expect(db.usageRows).toHaveLength(before)
    expect(db.ledgerRows).toHaveLength(0)
  })

  it('different users do not block each other (locks are per user)', async () => {
    const db = makeFakeDb(true)
    mockPrisma = db.client
    const users = ['user-a', 'user-b', 'user-c']

    const results = await Promise.all(
      users.flatMap((userId) =>
        Array.from({ length: 4 }, () =>
          consumeAiSignal(
            { userId, membership: null },
            MeteredFeature.AI_FORECAST,
          ),
        ),
      ),
    )

    expect(results.every((r) => r.source === UsageSource.BASE)).toBe(true)
    for (const userId of users) {
      expect(db.usageRows.filter((r) => r.userId === userId)).toHaveLength(4)
    }
  })
})
