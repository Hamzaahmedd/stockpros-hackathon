jest.mock('../logger', () => ({ logger: { info: jest.fn() } }))

import { TeamAuditAction } from '@prisma/client'
import { logger } from '../logger'
import { recordTeamAudit } from '../team-audit'

beforeEach(() => jest.clearAllMocks())

describe('recordTeamAudit', () => {
  it('writes through the client it is given (the surrounding transaction)', async () => {
    const tx = { teamAuditLog: { create: jest.fn() } }
    await recordTeamAudit(tx as never, {
      teamId: 't1',
      actorUserId: 'u1',
      targetUserId: 'u2',
      action: TeamAuditAction.ROLE_CHANGED,
      metadata: { from: 'MEMBER', to: 'ADMIN' },
    })

    expect(tx.teamAuditLog.create).toHaveBeenCalledWith({
      data: {
        teamId: 't1',
        actorUserId: 'u1',
        action: 'ROLE_CHANGED',
        targetUserId: 'u2',
        metadata: { from: 'MEMBER', to: 'ADMIN' },
      },
    })
  })

  it('stores system actions with no actor or target', async () => {
    const tx = { teamAuditLog: { create: jest.fn() } }
    await recordTeamAudit(tx as never, {
      teamId: 't1',
      action: TeamAuditAction.SUBSCRIPTION_EXPIRED,
    })
    expect(tx.teamAuditLog.create.mock.calls[0][0].data).toMatchObject({
      actorUserId: null,
      targetUserId: null,
    })
  })

  it('logs ids and the action only — no metadata values', async () => {
    const tx = { teamAuditLog: { create: jest.fn() } }
    await recordTeamAudit(tx as never, {
      teamId: 't1',
      actorUserId: 'u1',
      action: TeamAuditAction.SEATS_ADDED,
      metadata: { seatCount: 3 },
    })
    expect(logger.info).toHaveBeenCalledWith('[TeamAudit] recorded', {
      teamId: 't1',
      action: 'SEATS_ADDED',
      actorUserId: 'u1',
    })
  })

  it('does not log a missing actor or target', async () => {
    await recordTeamAudit({ teamAuditLog: { create: jest.fn() } } as never, {
      teamId: 't1',
      action: TeamAuditAction.SUBSCRIPTION_EXPIRED,
    })
    expect(logger.info).toHaveBeenCalledWith('[TeamAudit] recorded', {
      teamId: 't1',
      action: 'SUBSCRIPTION_EXPIRED',
    })
  })
})
