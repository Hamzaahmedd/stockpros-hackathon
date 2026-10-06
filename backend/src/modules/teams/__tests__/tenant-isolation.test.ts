/**
 * Cross-tenant isolation for every team route.
 *
 * Two workspaces (A and B) share one in-memory database (see
 * src/__tests__/fake-tenant-db.ts, which really applies each query's `where`).
 * Every case acts as a user of workspace B and aims at workspace A's data —
 * by id, by token, by cursor or simply by listing — and must either be refused
 * or see only B's rows. Every mutation is followed by a check that A's rows
 * are byte-for-byte unchanged.
 *
 * A structural guard fails this file when a route is added to routes.ts
 * without an isolation case, so the matrix cannot silently go stale.
 *
 * Honest limit: this proves the queries carry the right filters, not that
 * Postgres enforces isolation (no database is used; row-level security is a
 * separate follow-up).
 */
import {
  createFakeDb,
  snapshotTeam,
  type Row,
} from '../../../__tests__/fake-tenant-db'

let db: ReturnType<typeof createFakeDb>

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return db
  },
}))

jest.mock('../../../shared/infrastructure/team-access', () => ({
  ...jest.requireActual('../../../shared/infrastructure/team-access'),
  getActiveMembership: jest.fn(),
  resolveFallbackPlan: jest.fn().mockResolvedValue('FREE'),
}))

jest.mock('../../payments/public', () => ({
  TEAM_MAX_SEATS: 150,
  SEARCH_USAGE_FEATURE: 'search',
  assertCanCreateTeam: jest.fn(),
  createSeatAdditionCheckout: jest.fn(),
  createTeamCheckout: jest.fn(),
  recordUsage: jest.fn(),
  resolveUsageWindowStart: jest.fn(),
}))
jest.mock('../../notifications/public', () => ({
  enqueueTeamInviteEmail: jest.fn().mockResolvedValue(undefined),
  enqueueTeamJoinRequestEmail: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../domain-verification', () => ({
  checkDomainTxtRecord: jest.fn().mockResolvedValue(false),
  verificationRecordName: (domain: string) => domain,
  verificationRecordValue: (token: string) => token,
}))
jest.mock('../../auth', () => ({ authTokenMiddleware: jest.fn() }))

import config from '@/config'
import { TeamRole } from '@prisma/client'
import { getActiveMembership } from '../../../shared/infrastructure/team-access'
import { hashToken } from '../../../shared/utils'
import { resolveUsageWindowStart, recordUsage } from '../../payments/public'
import * as admin from '../admin-service'
import router from '../routes'
import * as joinRequests from '../join-requests'
import * as service from '../service'
import * as workspace from '../workspace-service'

const A = 'team-A'
const B = 'team-B'
const FUTURE = new Date('2099-01-01T00:00:00Z')
const TABLES = [
  'team',
  'teamMember',
  'teamInvite',
  'teamDomain',
  'teamJoinRequest',
  'sharedWatchlist',
  'sharedScreener',
  'sharedResearchNote',
  'teamAuditLog',
  'subscription',
]

const user = (id: string, email: string) => ({
  id,
  email,
  displayName: `Name of ${id}`,
  status: 'ACTIVE',
  plan: 'TEAM',
})

const member = (teamId: string, userId: string, role: TeamRole) => ({
  id: `m-${userId}`,
  teamId,
  userId,
  role,
  monthlyCreditLimitPaisa: null,
  createdAt: new Date('2030-01-01'),
  user: {
    displayName: `Name of ${userId}`,
    email: `${userId}@x.com`,
    status: 'ACTIVE',
  },
})

const team = (id: string, ownerId: string) => ({
  id,
  name: `Workspace ${id}`,
  ownerId,
  status: 'ACTIVE',
  seatCapacity: 10,
  scheduledSeatCapacity: null,
  billingEmail: null,
  orgInstructions: null,
  defaultPreferences: null,
  creditBalanceInPaisa: 0,
  createdAt: new Date('2030-01-01'),
  owner: { email: `${ownerId}@x.com` },
})

const fixtures = (): Record<string, Row[]> => ({
  user: [
    user('a-owner', 'a-owner@x.com'),
    user('a-admin', 'a-admin@x.com'),
    user('a-member', 'a-member@x.com'),
    user('b-owner', 'b-owner@x.com'),
    user('b-admin', 'b-admin@x.com'),
    user('b-member', 'b-member@x.com'),
    user('a-cand', 'a-cand@a-open.com'),
    user('b-cand', 'b-cand@b-open.com'),
  ],
  team: [team(A, 'a-owner'), team(B, 'b-owner')],
  teamMember: [
    member(A, 'a-owner', TeamRole.OWNER),
    member(A, 'a-admin', TeamRole.ADMIN),
    member(A, 'a-member', TeamRole.MEMBER),
    member(B, 'b-owner', TeamRole.OWNER),
    member(B, 'b-admin', TeamRole.ADMIN),
    member(B, 'b-member', TeamRole.MEMBER),
  ],
  teamInvite: [
    {
      id: 'inv-A',
      teamId: A,
      email: 'newhire@a.com',
      role: TeamRole.MEMBER,
      token: hashToken('token-A'),
      expiresAt: FUTURE,
      createdAt: new Date('2030-01-01'),
      // The row as loaded with `include: { team }`.
      team: { status: 'ACTIVE', seatCapacity: 10 },
    },
    {
      id: 'inv-B',
      teamId: B,
      email: 'newhire@b.com',
      role: TeamRole.MEMBER,
      token: hashToken('token-B'),
      expiresAt: FUTURE,
      createdAt: new Date('2030-01-01'),
      // The row as loaded with `include: { team }`.
      team: { status: 'ACTIVE', seatCapacity: 10 },
    },
  ],
  teamDomain: [
    {
      id: 'dom-A',
      teamId: A,
      domain: 'a-fund.com',
      isVerified: false,
      verificationToken: 'ta',
      restrictOrgCreation: true,
    },
    {
      id: 'dom-B',
      teamId: B,
      domain: 'b-fund.com',
      isVerified: false,
      verificationToken: 'tb',
      restrictOrgCreation: true,
    },
    {
      id: 'dom-A-open',
      teamId: A,
      domain: 'a-open.com',
      isVerified: true,
      joinPolicy: 'REQUEST_APPROVAL',
      verificationToken: 'ta2',
      restrictOrgCreation: true,
      team: { id: A, name: `Workspace ${A}`, status: 'ACTIVE' },
    },
    {
      id: 'dom-B-open',
      teamId: B,
      domain: 'b-open.com',
      isVerified: true,
      joinPolicy: 'REQUEST_APPROVAL',
      verificationToken: 'tb2',
      restrictOrgCreation: true,
      team: { id: B, name: `Workspace ${B}`, status: 'ACTIVE' },
    },
  ],
  // Verified, open domains. `team` is the row as loaded with `include`.
  teamJoinRequest: [
    {
      id: 'jr-A',
      teamId: A,
      userId: 'a-cand',
      status: 'PENDING',
      createdAt: new Date('2030-01-01'),
      user: { displayName: 'Name of a-cand', email: 'a-cand@a-open.com' },
      team: { name: `Workspace ${A}`, status: 'ACTIVE' },
    },
    {
      id: 'jr-B',
      teamId: B,
      userId: 'b-cand',
      status: 'PENDING',
      createdAt: new Date('2030-01-01'),
      user: { displayName: 'Name of b-cand', email: 'b-cand@b-open.com' },
      team: { name: `Workspace ${B}`, status: 'ACTIVE' },
    },
  ],
  sharedWatchlist: [
    {
      id: 'wl-A',
      teamId: A,
      name: 'A list',
      symbols: ['AAPL'],
      createdBy: 'a-member',
      createdAt: new Date('2030-01-01'),
    },
    {
      id: 'wl-B',
      teamId: B,
      name: 'B list',
      symbols: ['MSFT'],
      createdBy: 'b-member',
      createdAt: new Date('2030-01-01'),
    },
  ],
  sharedScreener: [
    {
      id: 'sc-A',
      teamId: A,
      name: 'A screen',
      criteria: {},
      createdBy: 'a-member',
      createdAt: new Date('2030-01-01'),
    },
    {
      id: 'sc-B',
      teamId: B,
      name: 'B screen',
      criteria: {},
      createdBy: 'b-member',
      createdAt: new Date('2030-01-01'),
    },
  ],
  sharedResearchNote: [
    {
      id: 'note-A',
      teamId: A,
      symbol: 'AAPL',
      content: 'A note',
      authorId: 'a-member',
      createdAt: new Date('2030-01-01'),
    },
    {
      id: 'note-B',
      teamId: B,
      symbol: 'MSFT',
      content: 'B note',
      authorId: 'b-member',
      createdAt: new Date('2030-01-01'),
    },
  ],
  teamAuditLog: [
    {
      id: 'aud-A',
      teamId: A,
      actorUserId: 'a-owner',
      targetUserId: 'a-member',
      action: 'MEMBER_REMOVED',
      metadata: null,
      createdAt: new Date('2030-01-01'),
    },
    {
      id: 'aud-B',
      teamId: B,
      actorUserId: 'b-owner',
      targetUserId: 'b-member',
      action: 'MEMBER_REMOVED',
      metadata: null,
      createdAt: new Date('2030-01-01'),
    },
  ],
  subscription: [
    { id: 'sub-A', teamId: A, status: 'ACTIVE', autoRenew: true },
    { id: 'sub-B', teamId: B, status: 'ACTIVE', autoRenew: true },
  ],
  paymentTransaction: [
    {
      id: 'txn-A',
      teamId: A,
      status: 'COMPLETED',
      kind: 'SUBSCRIPTION',
      amountPaisa: 1,
      currency: 'PKR',
      seatCount: 1,
      createdAt: new Date('2030-01-01'),
    },
    {
      id: 'txn-B',
      teamId: B,
      status: 'COMPLETED',
      kind: 'SUBSCRIPTION',
      amountPaisa: 1,
      currency: 'PKR',
      seatCount: 1,
      createdAt: new Date('2030-01-01'),
    },
  ],
  // Models whose queries are recorded rather than answered.
  usageEvent: [],
  creditLedger: [],
  watchlist: [],
  decisionResult: [],
})

const snapshotA = () => snapshotTeam(db, A, TABLES)
const asUser = (userId: string) =>
  (getActiveMembership as jest.Mock).mockImplementation(async (id: string) => {
    const row = db.teamMember.rows.find((m) => m.userId === id)
    const owning = row && db.team.rows.find((t) => t.id === row.teamId)
    return row && owning?.status === 'ACTIVE'
      ? {
          teamId: row.teamId,
          role: row.role,
          monthlyCreditLimitPaisa: row.monthlyCreditLimitPaisa,
          orgInstructions: null,
        }
      : null
  })

beforeEach(() => {
  db = createFakeDb(fixtures())
  Object.assign(config.features, { enablePaymentProcessor: false })
  ;(resolveUsageWindowStart as jest.Mock).mockResolvedValue(new Date(0))
  ;(recordUsage as jest.Mock).mockResolvedValue(undefined)
})

/** The caller must be refused (or get a 404, which is indistinguishable from "does not exist"). */
const refused = async (promise: Promise<unknown>) => {
  await expect(promise).rejects.toMatchObject({
    statusCode: expect.any(Number),
  })
  await promise.catch((error) => {
    expect([400, 403, 404]).toContain(error.statusCode)
  })
}

// ─── isolation cases, one per route ──────────────────────────────────────────

const aRowsUntouched = (before: string) => expect(snapshotA()).toBe(before)

const listedIdsAreAllB = (rows: Row[]) =>
  expect(rows.map((row) => row.teamId ?? B)).not.toContain(A)

const firstWhere = (spy: jest.SpyInstance): Row =>
  (spy.mock.calls[0][0] as Row).where

type Case = () => Promise<void>

const CASES: Record<string, Case> = {
  'removing a member of another workspace': async () => {
    asUser('b-owner')
    const before = snapshotA()
    await refused(service.removeMember('b-owner', 'a-member'))
    aRowsUntouched(before)
  },
  "setting another workspace's member credit limit": async () => {
    asUser('b-owner')
    const before = snapshotA()
    await refused(service.setMemberCreditLimit('b-owner', 'a-member', 500))
    aRowsUntouched(before)
  },
  "changing another workspace's member role": async () => {
    asUser('b-owner')
    const before = snapshotA()
    await refused(admin.changeMemberRole('b-owner', 'a-member', 'ADMIN'))
    aRowsUntouched(before)
  },
  'transferring ownership to a user of another workspace': async () => {
    asUser('b-owner')
    const before = snapshotA()
    await refused(admin.transferOwnership('b-owner', 'a-member'))
    aRowsUntouched(before)
    expect(db.team.rows.find((t) => t.id === B)?.ownerId).toBe('b-owner')
  },
  "revoking another workspace's invite": async () => {
    asUser('b-owner')
    const before = snapshotA()
    await refused(admin.revokeInvite('b-owner', 'inv-A'))
    aRowsUntouched(before)
  },
  "resending another workspace's invite": async () => {
    asUser('b-owner')
    const before = snapshotA()
    await refused(admin.resendInvite('b-owner', 'inv-A'))
    aRowsUntouched(before)
  },
  "deleting another workspace's shared watchlist": async () => {
    asUser('b-admin')
    const before = snapshotA()
    await refused(workspace.deleteSharedWatchlist('b-admin', 'wl-A'))
    aRowsUntouched(before)
  },
  "deleting another workspace's shared screener": async () => {
    asUser('b-admin')
    const before = snapshotA()
    await refused(workspace.deleteSharedScreener('b-admin', 'sc-A'))
    aRowsUntouched(before)
  },
  "deleting another workspace's research note": async () => {
    asUser('b-admin')
    const before = snapshotA()
    await refused(workspace.deleteResearchNote('b-admin', 'note-A'))
    aRowsUntouched(before)
  },
  "verifying another workspace's domain": async () => {
    asUser('b-owner')
    const before = snapshotA()
    await refused(service.verifyDomain('b-owner', 'a-fund.com'))
    aRowsUntouched(before)
  },
  "accepting another workspace's invite with its token": async () => {
    // b-member is already seated, and the invite is for a different address.
    asUser('b-member')
    const before = snapshotA()
    await refused(service.acceptInvite('b-member', 'token-A'))
    aRowsUntouched(before)
    expect(db.teamInvite.rows.some((invite) => invite.id === 'inv-A')).toBe(
      true,
    )
  },
  "reading another workspace's audit log by cursor": async () => {
    asUser('b-owner')
    await refused(admin.listAuditLog('b-owner', { limit: 25, cursor: 'aud-A' }))
  },
  "listing this workspace's members, invites and assets shows none of A's":
    async () => {
      asUser('b-admin')
      const [members, invites, watchlists, screeners, notes] =
        await Promise.all([
          service.listMembers('b-admin'),
          admin.listInvites('b-admin'),
          workspace.listSharedWatchlists('b-admin'),
          workspace.listSharedScreeners('b-admin'),
          workspace.listResearchNotes('b-admin'),
        ])
      expect(members.map((m) => m.userId).sort()).toEqual([
        'b-admin',
        'b-member',
        'b-owner',
      ])
      expect(invites.map((i) => i.id)).toEqual(['inv-B'])
      expect(watchlists.map((w) => w.id)).toEqual(['wl-B'])
      expect(screeners.map((s) => s.id)).toEqual(['sc-B'])
      expect(notes.map((n) => n.id)).toEqual(['note-B'])
      listedIdsAreAllB([...watchlists, ...screeners, ...notes])
    },
  "the audit log and workspace summary show none of A's": async () => {
    asUser('b-owner')
    const log = await admin.listAuditLog('b-owner', { limit: 25 })
    expect(log.entries.map((entry) => entry.id)).toEqual(['aud-B'])
    const me = await service.getMyTeam('b-owner')
    expect(me.id).toBe(B)
    expect(me.seats.active).toBe(3)
  },
  "exporting a workspace includes none of A's data": async () => {
    asUser('b-owner')
    const snapshot = await admin.exportTeam('b-owner')
    const text = JSON.stringify(snapshot)
    for (const leak of [
      A,
      'a-owner',
      'a-member',
      'A list',
      'A note',
      'a-fund.com',
    ]) {
      expect(text).not.toContain(leak)
    }
    expect(text).toContain(B)
  },
  'deleting workspace B leaves workspace A untouched': async () => {
    asUser('b-owner')
    const before = snapshotA()
    await admin.deleteTeam('b-owner', `Workspace ${B}`)
    aRowsUntouched(before)
    expect(db.teamMember.rows.some((m) => m.teamId === B)).toBe(false)
    expect(db.sharedWatchlist.rows.map((w) => w.id)).toEqual(['wl-A'])
  },
  'leaving workspace B does not touch A': async () => {
    asUser('b-member')
    const before = snapshotA()
    await admin.leaveTeam('b-member')
    aRowsUntouched(before)
    expect(db.teamMember.rows.some((m) => m.userId === 'b-member')).toBe(false)
  },
  'every workspace write by an admin lands on B only': async () => {
    asUser('b-owner')
    const before = snapshotA()

    await service.addSeats('b-owner', 2)
    await admin.renameTeam('b-owner', 'Renamed B')
    await admin.updateBillingContact('b-owner', 'billing@b.com')
    await admin.scheduleSeatReduction('b-owner', 5)
    await admin.cancelSeatReduction('b-owner')
    await service.updateInstructions('b-owner', 'B only')
    await service.updateWorkspacePreferences('b-owner', {})
    await service.addDomain('b-owner', {
      domain: 'b2-fund.com',
      restrictOrgCreation: true,
    })
    await service.createInvite('b-owner', {
      email: 'fresh@b.com',
      role: 'MEMBER',
    })

    aRowsUntouched(before)
    const written = db.teamAuditLog.rows.filter((row) => row.id.includes('new'))
    expect(written.length).toBeGreaterThan(0)
    expect(written.every((row) => row.teamId === B)).toBe(true)
    expect(db.team.rows.find((t) => t.id === B)).toMatchObject({
      name: 'Renamed B',
      billingEmail: 'billing@b.com',
      orgInstructions: 'B only',
    })
  },
  "search and analytics query B's data only": async () => {
    asUser('b-admin')
    const spies = {
      watchlists: jest.spyOn(db.sharedWatchlist, 'findMany'),
      screeners: jest.spyOn(db.sharedScreener, 'findMany'),
      notes: jest.spyOn(db.sharedResearchNote, 'findMany'),
      members: jest.spyOn(db.teamMember, 'findMany'),
    }
    const groupBy = jest.fn().mockResolvedValue([])
    const emptyFind = jest.fn().mockResolvedValue([])
    Object.assign(db.usageEvent, { groupBy })
    Object.assign(db.creditLedger, { groupBy })
    Object.assign(db.watchlist, { findMany: emptyFind })
    Object.assign(db.decisionResult, { findMany: emptyFind })

    await workspace.searchWorkspace('b-admin', 'list')
    await workspace.getTeamAnalytics('b-admin')

    for (const spy of [spies.watchlists, spies.screeners, spies.notes]) {
      expect(firstWhere(spy).teamId).toBe(B)
    }
    expect(firstWhere(spies.members).teamId).toBe(B)
    for (const call of groupBy.mock.calls) {
      expect(call[0].where.teamId).toBe(B)
    }
    // Saved decisions are found through members of THIS workspace only.
    expect(
      emptyFind.mock.calls[0][0].where.run.user.teamMembers.some.teamId,
    ).toBe(B)
    // Analytics asks for the tickers of B's members, never A's.
    expect(emptyFind.mock.calls[1][0].where.userId.in.sort()).toEqual([
      'b-admin',
      'b-member',
      'b-owner',
    ])
  },
  'asking to join another workspace with a different email domain':
    async () => {
      asUser('b-cand')
      const before = snapshotA()
      await refused(joinRequests.requestToJoin('b-cand', A))
      aRowsUntouched(before)
      expect(
        db.teamJoinRequest.rows.filter((r) => r.teamId === A),
      ).toHaveLength(1)
    },
  "deciding another workspace's join request": async () => {
    asUser('b-owner')
    const before = snapshotA()
    await refused(joinRequests.approveJoinRequest('b-owner', 'jr-A'))
    await refused(joinRequests.declineJoinRequest('b-owner', 'jr-A'))
    aRowsUntouched(before)
    expect(db.teamMember.rows.some((m) => m.userId === 'a-cand')).toBe(false)
  },
  "listing join requests and options shows none of A's": async () => {
    asUser('b-admin')
    const listed = await joinRequests.listJoinRequests('b-admin')
    expect(listed.map((request) => request.id)).toEqual(['jr-B'])

    asUser('b-cand')
    const options = await joinRequests.listJoinOptions('b-cand')
    expect(options.map((option) => option.teamId)).toEqual([B])
    expect(await joinRequests.getMyJoinRequest('b-cand')).toMatchObject({
      teamId: B,
    })
  },
  "cancelling a join request only ever touches the caller's own": async () => {
    asUser('b-cand')
    const before = snapshotA()
    await joinRequests.cancelMyJoinRequest('b-cand')
    aRowsUntouched(before)
    expect(db.teamJoinRequest.rows.find((r) => r.id === 'jr-B')?.status).toBe(
      'CANCELLED',
    )
  },
  "setting another workspace's domain join policy": async () => {
    asUser('b-owner')
    const before = snapshotA()
    await refused(
      joinRequests.setJoinPolicy(
        'b-owner',
        'a-open.com',
        'AUTO_APPROVE' as any,
      ),
    )
    aRowsUntouched(before)
  },
  'creating or accepting with no membership reaches nothing': async () => {
    asUser('nobody')
    await expect(service.getMyTeam('nobody')).rejects.toMatchObject({
      statusCode: 404,
    })
    await expect(service.listMembers('nobody')).rejects.toMatchObject({
      statusCode: 404,
    })
    await expect(
      workspace.listSharedWatchlists('nobody'),
    ).rejects.toMatchObject({ statusCode: 404 })
  },
}

/** Which case proves which route. A route that only reads the caller's own preferences has no tenant data. */
const PERSONAL = 'personal preferences (no workspace data)'
const ROUTE_CASES: Record<string, string> = {
  'POST /': 'creating or accepting with no membership reaches nothing',
  'GET /me': "the audit log and workspace summary show none of A's",
  'POST /seats/add': 'every workspace write by an admin lands on B only',
  'POST /seats/reduce': 'every workspace write by an admin lands on B only',
  'DELETE /seats/reduce': 'every workspace write by an admin lands on B only',
  'PATCH /': 'every workspace write by an admin lands on B only',
  'DELETE /': 'deleting workspace B leaves workspace A untouched',
  'GET /export': "exporting a workspace includes none of A's data",
  'GET /audit-log': "reading another workspace's audit log by cursor",
  'PATCH /billing-contact': 'every workspace write by an admin lands on B only',
  'POST /ownership/transfer':
    'transferring ownership to a user of another workspace',
  'POST /leave': 'leaving workspace B does not touch A',
  'GET /members':
    "listing this workspace's members, invites and assets shows none of A's",
  'GET /invites':
    "listing this workspace's members, invites and assets shows none of A's",
  'POST /invites': 'every workspace write by an admin lands on B only',
  'POST /invites/accept': "accepting another workspace's invite with its token",
  'DELETE /invites/:id': "revoking another workspace's invite",
  'POST /invites/:id/resend': "resending another workspace's invite",
  'PATCH /members/:userId/role': "changing another workspace's member role",
  'DELETE /members/:userId': 'removing a member of another workspace',
  'PATCH /members/:userId/credit-limit':
    "setting another workspace's member credit limit",
  'POST /domains': 'every workspace write by an admin lands on B only',
  'POST /domains/verify': "verifying another workspace's domain",
  'PATCH /domains/:domain/join-policy':
    "setting another workspace's domain join policy",
  'GET /join-options': "listing join requests and options shows none of A's",
  'GET /join-requests/me':
    "listing join requests and options shows none of A's",
  'DELETE /join-requests/me':
    "cancelling a join request only ever touches the caller's own",
  'POST /join-requests':
    'asking to join another workspace with a different email domain',
  'GET /join-requests': "listing join requests and options shows none of A's",
  'POST /join-requests/:id/approve':
    "deciding another workspace's join request",
  'POST /join-requests/:id/decline':
    "deciding another workspace's join request",
  'PATCH /instructions': 'every workspace write by an admin lands on B only',
  'GET /preferences': PERSONAL,
  'PATCH /preferences': PERSONAL,
  'PATCH /preferences/workspace':
    'every workspace write by an admin lands on B only',
  'GET /analytics': "search and analytics query B's data only",
  'GET /search': "search and analytics query B's data only",
  'GET /watchlists':
    "listing this workspace's members, invites and assets shows none of A's",
  'POST /watchlists':
    'creating or accepting with no membership reaches nothing',
  'DELETE /watchlists/:id': "deleting another workspace's shared watchlist",
  'GET /screeners':
    "listing this workspace's members, invites and assets shows none of A's",
  'POST /screeners': 'creating or accepting with no membership reaches nothing',
  'DELETE /screeners/:id': "deleting another workspace's shared screener",
  'GET /notes':
    "listing this workspace's members, invites and assets shows none of A's",
  'POST /notes': 'creating or accepting with no membership reaches nothing',
  'DELETE /notes/:id': "deleting another workspace's research note",
}

describe('tenant isolation — workspace B user against workspace A data', () => {
  it.each(Object.entries(CASES))('%s', async (_name, run) => {
    await run()
  })
})

describe('isolation coverage guard', () => {
  interface Layer {
    route?: { path: string; methods: Record<string, boolean> }
  }
  const registered = (router as unknown as { stack: Layer[] }).stack
    .filter((layer) => layer.route)
    .map((layer) => {
      const { path, methods } = layer.route!
      return `${Object.keys(methods)[0].toUpperCase()} ${path}`
    })

  it('has an isolation case for every registered team route (add one when you add a route)', () => {
    expect(registered.filter((route) => !(route in ROUTE_CASES))).toEqual([])
  })

  it('does not list routes that no longer exist', () => {
    expect(
      Object.keys(ROUTE_CASES).filter((route) => !registered.includes(route)),
    ).toEqual([])
  })

  it('points every route at a case that actually runs', () => {
    const missing = Object.values(ROUTE_CASES).filter(
      (name) => name !== PERSONAL && !(name in CASES),
    )
    expect(missing).toEqual([])
  })
})
