import type { Prisma, PrismaClient } from '@prisma/client'
import {
  applyTenantContext,
  runInTenantTransaction,
  TenantSetting,
} from '../tenant-context'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const TEAM_ID = '00000000-0000-4000-8000-000000000002'

const makeTx = () => ({ $executeRaw: jest.fn().mockResolvedValue(1) })

/** Reassembles a tagged-template call into the SQL text and its bound values. */
const readCall = (call: unknown[]) => {
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]]
  return { sql: strings.join('?'), values }
}

describe('applyTenantContext', () => {
  it('sets both settings transaction-locally with bound parameters', async () => {
    const tx = makeTx()

    await applyTenantContext(tx as unknown as Prisma.TransactionClient, {
      userId: USER_ID,
      teamId: TEAM_ID,
    })

    const [user, team] = tx.$executeRaw.mock.calls.map(readCall)
    expect(user.sql).toContain('set_config(?, ?, true)')
    expect(user.values).toEqual([TenantSetting.USER_ID, USER_ID])
    expect(team.values).toEqual([TenantSetting.TEAM_ID, TEAM_ID])
  })

  it('stores a missing team as an empty string, never as a user value', async () => {
    const tx = makeTx()

    await applyTenantContext(tx as unknown as Prisma.TransactionClient, {
      userId: USER_ID,
      teamId: null,
    })

    expect(readCall(tx.$executeRaw.mock.calls[1]).values).toEqual([
      TenantSetting.TEAM_ID,
      '',
    ])
  })
})

describe('runInTenantTransaction', () => {
  it('scopes the transaction before any work runs and returns its result', async () => {
    const tx = makeTx()
    const client = {
      $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    }
    const work = jest.fn().mockImplementation(async () => {
      expect(tx.$executeRaw).toHaveBeenCalledTimes(2)
      return 'done'
    })

    const result = await runInTenantTransaction(
      client as unknown as PrismaClient,
      { userId: USER_ID, teamId: TEAM_ID },
      work,
    )

    expect(result).toBe('done')
    expect(work).toHaveBeenCalledWith(tx)
  })

  it('propagates a failure from the work so the transaction rolls back', async () => {
    const tx = makeTx()
    const client = {
      $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    }

    await expect(
      runInTenantTransaction(
        client as unknown as PrismaClient,
        { userId: USER_ID, teamId: null },
        () => Promise.reject(new Error('boom')),
      ),
    ).rejects.toThrow('boom')
  })
})
