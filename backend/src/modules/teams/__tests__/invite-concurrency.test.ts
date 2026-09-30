/**
 * Concurrency proof for seat reservation. `createInvite` counts
 * (active members + unexpired pending invites) against seat capacity, and
 * must do so under a team-row lock so simultaneous admins cannot both take the
 * last seat. The database is an in-memory fake with a FIFO mutex per lock
 * target and deliberate delays between read and write; the control run
 * disables the mutex and must over-issue, proving the harness sees the race.
 */
let mockPrisma: any

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

jest.mock('../../../shared/infrastructure/team-access', () => ({
  // keep the real, pure role check; only the DB-backed lookups are faked
  isTeamAdminRole: jest.requireActual(
    '../../../shared/infrastructure/team-access',
  ).isTeamAdminRole,
  getActiveMembership: jest.fn(),
  resolveFallbackPlan: jest.fn(),
}))

jest.mock('../../payments/public', () => ({
  TEAM_MAX_SEATS: 150,
  assertCanCreateTeam: jest.fn(),
  createSeatAdditionCheckout: jest.fn(),
  createTeamCheckout: jest.fn(),
}))

jest.mock('../../notifications/public', () => ({
  enqueueTeamInviteEmail: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../domain-verification', () => ({
  checkDomainTxtRecord: jest.fn(),
  verificationRecordName: (d: string) => d,
  verificationRecordValue: (t: string) => t,
}))

import { TeamRole } from '@prisma/client'
import { ConflictError } from '../../../shared/errors'
import { getActiveMembership } from '../../../shared/infrastructure/team-access'
import * as service from '../service'

const tick = () => new Promise((resolve) => setImmediate(resolve))
const DAY_MS = 24 * 60 * 60 * 1000

interface Invite {
  email: string
  expiresAt: Date
}

const makeFakeDb = (opts: {
  useLock: boolean
  capacity: number
  members: number
}) => {
  const invites: Invite[] = []
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
    // Tagged template: (strings, teamId) — `SELECT ... FOR UPDATE` on the team row.
    $queryRaw: async (_strings: TemplateStringsArray, teamId: string) => {
      if (opts.useLock) held.push(await acquire(teamId))
      return [{ id: teamId }]
    },
    team: {
      findUniqueOrThrow: async () => ({ seatCapacity: opts.capacity }),
    },
    teamMember: {
      count: async () => {
        await tick()
        return opts.members
      },
    },
    teamInvite: {
      count: async ({ where }: any) => {
        const now = where.expiresAt.gt as Date
        const n = invites.filter(
          (i) => i.expiresAt > now && i.email !== where.email.not,
        ).length
        await tick() // read → (other transactions run here) → write
        return n
      },
      deleteMany: async ({ where }: any) => {
        for (let i = invites.length - 1; i >= 0; i -= 1) {
          if (invites[i].email === where.email) invites.splice(i, 1)
        }
      },
      create: async ({ data }: any) => {
        await tick()
        invites.push({ email: data.email, expiresAt: data.expiresAt })
        return { id: `inv-${invites.length}`, ...data }
      },
    },
    user: { findUnique: async () => null },
  })

  const client = {
    $transaction: async (fn: (tx: any) => Promise<unknown>) => {
      const held: (() => void)[] = []
      try {
        return await fn(makeTx(held))
      } finally {
        held.forEach((release) => release())
      }
    },
    // Used by the (best-effort) email dispatch after the invite is stored.
    user: { findUniqueOrThrow: async () => ({ displayName: 'Olivia' }) },
    team: { findUniqueOrThrow: async () => ({ name: 'Alpha Fund' }) },
  }
  return { client, invites }
}

const invite = (email: string) =>
  service.createInvite('owner-1', { email, role: 'MEMBER' })

const burst = async (emails: string[]) => Promise.allSettled(emails.map(invite))

const outcome = (results: PromiseSettledResult<unknown>[]) => ({
  issued: results.filter((r) => r.status === 'fulfilled').length,
  refused: results.filter(
    (r) => r.status === 'rejected' && r.reason instanceof ConflictError,
  ).length,
})

const emails = (n: number) =>
  Array.from({ length: n }, (_, i) => `user${i}@fund.com`)

beforeEach(() => {
  ;(getActiveMembership as jest.Mock).mockResolvedValue({
    teamId: 'team-1',
    role: TeamRole.OWNER,
    monthlyCreditLimitPaisa: null,
    orgInstructions: null,
  })
})

describe('seat reservation under concurrent invites', () => {
  it('with the team-row lock, invites never exceed the remaining seats', async () => {
    const db = makeFakeDb({ useLock: true, capacity: 5, members: 1 }) // 4 seats free
    mockPrisma = db.client

    const result = outcome(await burst(emails(10)))

    expect(result).toEqual({ issued: 4, refused: 6 })
    expect(db.invites).toHaveLength(4)
  })

  it('CONTROL — without the lock the same burst over-issues, so the harness does detect the race', async () => {
    const db = makeFakeDb({ useLock: false, capacity: 5, members: 1 })
    mockPrisma = db.client

    const result = outcome(await burst(emails(10)))

    expect(result.issued).toBeGreaterThan(4)
  })

  it('unexpired pending invites reserve seats; expired ones do not', async () => {
    const db = makeFakeDb({ useLock: true, capacity: 4, members: 1 }) // 3 free
    mockPrisma = db.client
    db.invites.push(
      { email: 'live1@fund.com', expiresAt: new Date(Date.now() + DAY_MS) },
      { email: 'live2@fund.com', expiresAt: new Date(Date.now() + DAY_MS) },
      { email: 'stale@fund.com', expiresAt: new Date(Date.now() - DAY_MS) }, // frees its seat
    )

    // members 1 + live invites 2 = 3 of 4 reserved -> exactly one more fits.
    const result = outcome(await burst(emails(5)))

    expect(result).toEqual({ issued: 1, refused: 4 })
  })

  it('re-inviting an email that already holds a link does not consume a second seat', async () => {
    const db = makeFakeDb({ useLock: true, capacity: 3, members: 1 })
    mockPrisma = db.client

    await invite('a@fund.com')
    await invite('b@fund.com') // 1 member + 2 invites = full
    await expect(invite('c@fund.com')).rejects.toBeInstanceOf(ConflictError)

    await expect(invite('a@fund.com')).resolves.toBeDefined() // replaces its own link
    expect(db.invites.filter((i) => i.email === 'a@fund.com')).toHaveLength(1)
    expect(db.invites).toHaveLength(2)
  })

  it('a full workspace refuses every invite and stores nothing', async () => {
    const db = makeFakeDb({ useLock: true, capacity: 2, members: 2 })
    mockPrisma = db.client

    const result = outcome(await burst(emails(5)))

    expect(result).toEqual({ issued: 0, refused: 5 })
    expect(db.invites).toHaveLength(0)
  })
})
