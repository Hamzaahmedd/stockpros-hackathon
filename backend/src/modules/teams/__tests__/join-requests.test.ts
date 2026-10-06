const mockPrisma: any = {
  user: { findUniqueOrThrow: jest.fn() },
  teamDomain: { findFirst: jest.fn(), update: jest.fn() },
  teamJoinRequest: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
  teamMember: { findMany: jest.fn() },
  $transaction: jest.fn(),
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

jest.mock('../../../shared/infrastructure/team-access', () => ({
  ...jest.requireActual('../../../shared/infrastructure/team-access'),
  getActiveMembership: jest.fn(),
}))

jest.mock('../../../shared/infrastructure/team-audit', () => ({
  recordTeamAudit: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../service', () => ({
  requireMembership: jest.fn(),
  seatMember: jest.fn(),
}))

jest.mock('../../notifications/public', () => ({
  enqueueTeamJoinRequestEmail: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}))

import {
  JoinRequestStatus,
  TeamAuditAction,
  TeamJoinPolicy,
  TeamRole,
} from '@prisma/client'
import { getActiveMembership } from '../../../shared/infrastructure/team-access'
import { recordTeamAudit } from '../../../shared/infrastructure/team-audit'
import { logger } from '../../../shared/infrastructure/logger'
import { enqueueTeamJoinRequestEmail } from '../../notifications/public'
import { JOIN_REQUEST_COOLDOWN_MS } from '../constants'
import * as joinRequests from '../join-requests'
import { requireMembership, seatMember } from '../service'

const TEAM = '00000000-0000-4000-8000-0000000000a1'
const USER = '00000000-0000-4000-8000-0000000000b1'
const ADMIN = '00000000-0000-4000-8000-0000000000c1'
const REQUEST = '00000000-0000-4000-8000-0000000000d1'

const openDomain = (joinPolicy: TeamJoinPolicy) => ({
  domain: 'fund.com',
  joinPolicy,
  team: { id: TEAM, name: 'Alpha Fund' },
})

const asCandidate = (email = 'sam@fund.com') =>
  mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
    email,
    displayName: 'Sam Lee',
  })

const tx = {
  teamJoinRequest: mockPrisma.teamJoinRequest,
  teamDomain: mockPrisma.teamDomain,
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(seatMember as jest.Mock).mockReset()
  mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx))
  ;(getActiveMembership as jest.Mock).mockResolvedValue(null)
  ;(requireMembership as jest.Mock).mockResolvedValue({
    teamId: TEAM,
    role: TeamRole.ADMIN,
  })
  mockPrisma.teamMember.findMany.mockResolvedValue([
    { user: { email: 'owner@fund.com' } },
    { user: { email: 'admin@fund.com' } },
  ])
})

describe('listJoinOptions', () => {
  it('returns nothing for a user who already has a workspace', async () => {
    ;(getActiveMembership as jest.Mock).mockResolvedValue({ teamId: TEAM })

    await expect(joinRequests.listJoinOptions(USER)).resolves.toEqual([])
    expect(mockPrisma.teamDomain.findFirst).not.toHaveBeenCalled()
  })

  it.each(['gmail.com', 'outlook.com'])(
    'never matches a public mailbox domain (%s)',
    async (domain) => {
      asCandidate(`sam@${domain}`)

      await expect(joinRequests.listJoinOptions(USER)).resolves.toEqual([])
      expect(mockPrisma.teamDomain.findFirst).not.toHaveBeenCalled()
    },
  )

  it('returns nothing when the domain is not open', async () => {
    asCandidate()
    mockPrisma.teamDomain.findFirst.mockResolvedValue(null)

    await expect(joinRequests.listJoinOptions(USER)).resolves.toEqual([])
  })

  it('offers the workspace that owns the verified, open domain', async () => {
    asCandidate()
    mockPrisma.teamDomain.findFirst.mockResolvedValue(
      openDomain(TeamJoinPolicy.REQUEST_APPROVAL),
    )

    await expect(joinRequests.listJoinOptions(USER)).resolves.toEqual([
      {
        teamId: TEAM,
        teamName: 'Alpha Fund',
        domain: 'fund.com',
        joinPolicy: TeamJoinPolicy.REQUEST_APPROVAL,
      },
    ])
    expect(
      mockPrisma.teamDomain.findFirst.mock.calls[0][0].where,
    ).toMatchObject({
      domain: 'fund.com',
      isVerified: true,
      joinPolicy: { not: TeamJoinPolicy.INVITE_ONLY },
      team: { status: 'ACTIVE' },
    })
  })

  it('ignores a record that is somehow INVITE_ONLY', async () => {
    asCandidate()
    mockPrisma.teamDomain.findFirst.mockResolvedValue(
      openDomain(TeamJoinPolicy.INVITE_ONLY),
    )

    await expect(joinRequests.listJoinOptions(USER)).resolves.toEqual([])
  })
})

describe('getMyJoinRequest', () => {
  it('returns null without a pending request', async () => {
    mockPrisma.teamJoinRequest.findFirst.mockResolvedValue(null)

    await expect(joinRequests.getMyJoinRequest(USER)).resolves.toBeNull()
  })

  it('returns the pending request with the workspace name', async () => {
    const createdAt = new Date('2030-01-01')
    mockPrisma.teamJoinRequest.findFirst.mockResolvedValue({
      id: REQUEST,
      teamId: TEAM,
      createdAt,
      team: { name: 'Alpha Fund' },
    })

    await expect(joinRequests.getMyJoinRequest(USER)).resolves.toEqual({
      id: REQUEST,
      teamId: TEAM,
      teamName: 'Alpha Fund',
      status: JoinRequestStatus.PENDING,
      createdAt,
    })
  })
})

describe('requestToJoin', () => {
  it('answers 404 for a workspace that is not open to this user', async () => {
    asCandidate()
    mockPrisma.teamDomain.findFirst.mockResolvedValue(null)

    await expect(joinRequests.requestToJoin(USER, TEAM)).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(mockPrisma.teamDomain.findFirst.mock.calls[0][0].where.teamId).toBe(
      TEAM,
    )
  })

  it('refuses someone who already belongs to a workspace', async () => {
    asCandidate()
    mockPrisma.teamDomain.findFirst.mockResolvedValue(
      openDomain(TeamJoinPolicy.AUTO_APPROVE),
    )
    ;(getActiveMembership as jest.Mock).mockResolvedValue({ teamId: 'other' })

    await expect(joinRequests.requestToJoin(USER, TEAM)).rejects.toMatchObject({
      statusCode: 409,
    })
    expect(seatMember).not.toHaveBeenCalled()
  })

  it('AUTO_APPROVE seats the user as a member and audits it', async () => {
    asCandidate()
    mockPrisma.teamDomain.findFirst.mockResolvedValue(
      openDomain(TeamJoinPolicy.AUTO_APPROVE),
    )

    await expect(joinRequests.requestToJoin(USER, TEAM)).resolves.toEqual({
      teamId: TEAM,
      status: JoinRequestStatus.APPROVED,
    })
    expect(seatMember).toHaveBeenCalledWith(tx, {
      teamId: TEAM,
      userId: USER,
      role: TeamRole.MEMBER,
    })
    expect(recordTeamAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: TeamAuditAction.JOIN_APPROVED,
        metadata: { auto: true },
      }),
    )
    expect(mockPrisma.teamJoinRequest.upsert).not.toHaveBeenCalled()
  })

  it('AUTO_APPROVE surfaces a full workspace and creates nothing', async () => {
    asCandidate()
    mockPrisma.teamDomain.findFirst.mockResolvedValue(
      openDomain(TeamJoinPolicy.AUTO_APPROVE),
    )
    ;(seatMember as jest.Mock).mockRejectedValue(
      Object.assign(new Error('no free seats'), { statusCode: 409 }),
    )

    await expect(joinRequests.requestToJoin(USER, TEAM)).rejects.toMatchObject({
      statusCode: 409,
    })
    expect(recordTeamAudit).not.toHaveBeenCalled()
  })

  describe('REQUEST_APPROVAL', () => {
    beforeEach(() => {
      asCandidate()
      mockPrisma.teamDomain.findFirst.mockResolvedValue(
        openDomain(TeamJoinPolicy.REQUEST_APPROVAL),
      )
      mockPrisma.teamJoinRequest.findUnique.mockResolvedValue(null)
      mockPrisma.teamJoinRequest.upsert.mockResolvedValue({ id: REQUEST })
    })

    it('queues a pending request, audits it and emails every owner and admin', async () => {
      await expect(joinRequests.requestToJoin(USER, TEAM)).resolves.toEqual({
        teamId: TEAM,
        status: JoinRequestStatus.PENDING,
      })

      expect(mockPrisma.teamJoinRequest.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { teamId: TEAM, userId: USER },
          update: expect.objectContaining({
            status: JoinRequestStatus.PENDING,
            decidedBy: null,
            decidedAt: null,
          }),
        }),
      )
      expect(recordTeamAudit).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: TeamAuditAction.JOIN_REQUESTED }),
      )
      expect(enqueueTeamJoinRequestEmail).toHaveBeenCalledTimes(2)
      expect(enqueueTeamJoinRequestEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@fund.com',
          kind: 'REQUESTED',
          requesterName: 'Sam Lee',
          teamName: 'Alpha Fund',
        }),
      )
      expect(seatMember).not.toHaveBeenCalled()
    })

    it('is idempotent while a request is already pending (no second email)', async () => {
      mockPrisma.teamJoinRequest.findUnique.mockResolvedValue({
        status: JoinRequestStatus.PENDING,
      })

      await expect(joinRequests.requestToJoin(USER, TEAM)).resolves.toEqual({
        teamId: TEAM,
        status: JoinRequestStatus.PENDING,
      })
      expect(mockPrisma.teamJoinRequest.upsert).not.toHaveBeenCalled()
      expect(enqueueTeamJoinRequestEmail).not.toHaveBeenCalled()
    })

    it('holds back a user declined within the cooldown', async () => {
      mockPrisma.teamJoinRequest.findUnique.mockResolvedValue({
        status: JoinRequestStatus.DECLINED,
        decidedAt: new Date(Date.now() - JOIN_REQUEST_COOLDOWN_MS / 2),
      })

      await expect(
        joinRequests.requestToJoin(USER, TEAM),
      ).rejects.toMatchObject({ statusCode: 409 })
      expect(mockPrisma.teamJoinRequest.upsert).not.toHaveBeenCalled()
    })

    it('lets a user ask again once the cooldown has passed', async () => {
      mockPrisma.teamJoinRequest.findUnique.mockResolvedValue({
        status: JoinRequestStatus.DECLINED,
        decidedAt: new Date(Date.now() - JOIN_REQUEST_COOLDOWN_MS - 1000),
      })

      await expect(joinRequests.requestToJoin(USER, TEAM)).resolves.toEqual({
        teamId: TEAM,
        status: JoinRequestStatus.PENDING,
      })
    })

    it('lets a user whose earlier request was cancelled ask again', async () => {
      mockPrisma.teamJoinRequest.findUnique.mockResolvedValue({
        status: JoinRequestStatus.CANCELLED,
        decidedAt: new Date(),
      })

      await expect(joinRequests.requestToJoin(USER, TEAM)).resolves.toEqual({
        teamId: TEAM,
        status: JoinRequestStatus.PENDING,
      })
    })

    it('still succeeds when the admin email cannot be queued, and logs it', async () => {
      ;(enqueueTeamJoinRequestEmail as jest.Mock).mockRejectedValueOnce(
        new Error('redis down'),
      )

      await expect(joinRequests.requestToJoin(USER, TEAM)).resolves.toEqual({
        teamId: TEAM,
        status: JoinRequestStatus.PENDING,
      })
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('redis down'),
      )
    })

    it('logs a non-Error failure from the queue too', async () => {
      mockPrisma.teamMember.findMany.mockRejectedValueOnce('boom')

      await expect(joinRequests.requestToJoin(USER, TEAM)).resolves.toEqual({
        teamId: TEAM,
        status: JoinRequestStatus.PENDING,
      })
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('boom'))
    })
  })
})

describe('cancelMyJoinRequest', () => {
  it('cancels only the caller’s pending request', async () => {
    mockPrisma.teamJoinRequest.updateMany.mockResolvedValue({ count: 1 })

    await joinRequests.cancelMyJoinRequest(USER)

    expect(mockPrisma.teamJoinRequest.updateMany).toHaveBeenCalledWith({
      where: { userId: USER, status: JoinRequestStatus.PENDING },
      data: expect.objectContaining({ status: JoinRequestStatus.CANCELLED }),
    })
  })

  it('answers 404 when there is nothing to cancel', async () => {
    mockPrisma.teamJoinRequest.updateMany.mockResolvedValue({ count: 0 })

    await expect(joinRequests.cancelMyJoinRequest(USER)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('listJoinRequests', () => {
  it('lists pending requests of the caller’s workspace only, flattened', async () => {
    const createdAt = new Date('2030-01-01')
    mockPrisma.teamJoinRequest.findMany.mockResolvedValue([
      {
        id: REQUEST,
        userId: USER,
        status: JoinRequestStatus.PENDING,
        createdAt,
        user: { displayName: 'Sam Lee', email: 'sam@fund.com' },
      },
    ])

    await expect(joinRequests.listJoinRequests(ADMIN)).resolves.toEqual([
      {
        id: REQUEST,
        userId: USER,
        status: JoinRequestStatus.PENDING,
        createdAt,
        displayName: 'Sam Lee',
        email: 'sam@fund.com',
      },
    ])
    expect(mockPrisma.teamJoinRequest.findMany.mock.calls[0][0].where).toEqual({
      teamId: TEAM,
      status: JoinRequestStatus.PENDING,
    })
  })

  it('requires the invite permission', async () => {
    ;(requireMembership as jest.Mock).mockRejectedValue(
      Object.assign(new Error('forbidden'), { statusCode: 403 }),
    )

    await expect(joinRequests.listJoinRequests(USER)).rejects.toMatchObject({
      statusCode: 403,
    })
  })
})

describe('approve / decline', () => {
  const pending = {
    id: REQUEST,
    userId: USER,
    user: { email: 'sam@fund.com', displayName: 'Sam Lee' },
    team: { name: 'Alpha Fund' },
  }

  beforeEach(() => {
    mockPrisma.teamJoinRequest.findFirst.mockResolvedValue(pending)
    mockPrisma.teamJoinRequest.updateMany.mockResolvedValue({ count: 1 })
  })

  it('answers 404 for a request outside the caller’s workspace', async () => {
    mockPrisma.teamJoinRequest.findFirst.mockResolvedValue(null)

    await expect(
      joinRequests.approveJoinRequest(ADMIN, REQUEST),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(mockPrisma.teamJoinRequest.findFirst.mock.calls[0][0].where).toEqual(
      { id: REQUEST, teamId: TEAM, status: JoinRequestStatus.PENDING },
    )
  })

  it('approve claims the request, seats the user as MEMBER, audits and emails them', async () => {
    await joinRequests.approveJoinRequest(ADMIN, REQUEST)

    expect(mockPrisma.teamJoinRequest.updateMany).toHaveBeenCalledWith({
      where: { id: REQUEST, status: JoinRequestStatus.PENDING },
      data: expect.objectContaining({
        status: JoinRequestStatus.APPROVED,
        decidedBy: ADMIN,
      }),
    })
    expect(seatMember).toHaveBeenCalledWith(tx, {
      teamId: TEAM,
      userId: USER,
      role: TeamRole.MEMBER,
    })
    expect(recordTeamAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: TeamAuditAction.JOIN_APPROVED,
        actorUserId: ADMIN,
        targetUserId: USER,
      }),
    )
    expect(enqueueTeamJoinRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'sam@fund.com', kind: 'APPROVED' }),
    )
  })

  it('approve refuses a request someone else already handled', async () => {
    mockPrisma.teamJoinRequest.updateMany.mockResolvedValue({ count: 0 })

    await expect(
      joinRequests.approveJoinRequest(ADMIN, REQUEST),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(seatMember).not.toHaveBeenCalled()
    expect(enqueueTeamJoinRequestEmail).not.toHaveBeenCalled()
  })

  it('approve with no free seat fails, sends nothing and leaves the claim to roll back', async () => {
    ;(seatMember as jest.Mock).mockRejectedValue(
      Object.assign(new Error('This workspace has no free seats'), {
        statusCode: 409,
      }),
    )

    await expect(
      joinRequests.approveJoinRequest(ADMIN, REQUEST),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(recordTeamAudit).not.toHaveBeenCalled()
    expect(enqueueTeamJoinRequestEmail).not.toHaveBeenCalled()
  })

  it('decline marks it DECLINED, audits and emails the requester', async () => {
    await joinRequests.declineJoinRequest(ADMIN, REQUEST)

    expect(mockPrisma.teamJoinRequest.updateMany).toHaveBeenCalledWith({
      where: { id: REQUEST, status: JoinRequestStatus.PENDING },
      data: expect.objectContaining({
        status: JoinRequestStatus.DECLINED,
        decidedBy: ADMIN,
      }),
    })
    expect(seatMember).not.toHaveBeenCalled()
    expect(recordTeamAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: TeamAuditAction.JOIN_DECLINED }),
    )
    expect(enqueueTeamJoinRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'sam@fund.com', kind: 'DECLINED' }),
    )
  })

  it('decline refuses a request someone else already handled', async () => {
    mockPrisma.teamJoinRequest.updateMany.mockResolvedValue({ count: 0 })

    await expect(
      joinRequests.declineJoinRequest(ADMIN, REQUEST),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(enqueueTeamJoinRequestEmail).not.toHaveBeenCalled()
  })

  it('a failed decision email never fails the decision', async () => {
    ;(enqueueTeamJoinRequestEmail as jest.Mock).mockRejectedValueOnce(
      new Error('redis down'),
    )

    await expect(
      joinRequests.declineJoinRequest(ADMIN, REQUEST),
    ).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalled()
  })
})

describe('setJoinPolicy', () => {
  const record = { id: 'dom-1', isVerified: true }

  it('answers 404 for a domain outside the caller’s workspace', async () => {
    mockPrisma.teamDomain.findFirst.mockResolvedValue(null)

    await expect(
      joinRequests.setJoinPolicy(
        ADMIN,
        'other.com',
        TeamJoinPolicy.AUTO_APPROVE,
      ),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(mockPrisma.teamDomain.findFirst).toHaveBeenCalledWith({
      where: { teamId: TEAM, domain: 'other.com' },
    })
  })

  it('refuses to open an unverified domain', async () => {
    mockPrisma.teamDomain.findFirst.mockResolvedValue({
      ...record,
      isVerified: false,
    })

    await expect(
      joinRequests.setJoinPolicy(
        ADMIN,
        'fund.com',
        TeamJoinPolicy.REQUEST_APPROVAL,
      ),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.teamDomain.update).not.toHaveBeenCalled()
  })

  it('lets an unverified domain stay INVITE_ONLY', async () => {
    mockPrisma.teamDomain.findFirst.mockResolvedValue({
      ...record,
      isVerified: false,
    })
    mockPrisma.teamDomain.update.mockResolvedValue({ id: 'dom-1' })

    await expect(
      joinRequests.setJoinPolicy(ADMIN, 'fund.com', TeamJoinPolicy.INVITE_ONLY),
    ).resolves.toEqual({ id: 'dom-1' })
  })

  it('updates the policy and audits it', async () => {
    mockPrisma.teamDomain.findFirst.mockResolvedValue(record)
    mockPrisma.teamDomain.update.mockResolvedValue({
      id: 'dom-1',
      joinPolicy: TeamJoinPolicy.AUTO_APPROVE,
    })

    await joinRequests.setJoinPolicy(
      ADMIN,
      'fund.com',
      TeamJoinPolicy.AUTO_APPROVE,
    )

    expect(mockPrisma.teamDomain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dom-1' },
        data: { joinPolicy: TeamJoinPolicy.AUTO_APPROVE },
      }),
    )
    expect(recordTeamAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: TeamAuditAction.JOIN_POLICY_SET,
        metadata: {
          domainId: 'dom-1',
          joinPolicy: TeamJoinPolicy.AUTO_APPROVE,
        },
      }),
    )
  })
})
