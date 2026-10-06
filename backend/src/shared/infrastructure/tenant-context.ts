import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * Postgres session settings read by the row-level-security policies staged in
 * prisma/rls/. The names are part of the SQL contract: change both together.
 */
export enum TenantSetting {
  USER_ID = 'app.current_user_id',
  TEAM_ID = 'app.current_team_id',
}

export interface TenantContext {
  userId: string
  /** Null for a user with no active workspace; policies then match no team rows. */
  teamId: string | null
}

/**
 * Scopes the current transaction to a tenant. The third `set_config`
 * argument (`true`) makes the value transaction-local, so it can never leak to
 * another request that reuses the same pooled connection. An unset team is
 * stored as '' and read back through NULLIF in the policies.
 */
export async function applyTenantContext(
  tx: Prisma.TransactionClient,
  context: TenantContext,
): Promise<void> {
  await tx.$executeRaw`SELECT set_config(${TenantSetting.USER_ID}, ${context.userId}, true)`
  await tx.$executeRaw`SELECT set_config(${TenantSetting.TEAM_ID}, ${context.teamId ?? ''}, true)`
}

/**
 * Runs `work` in a transaction already scoped to `context`. Use it (and the
 * `tx` it hands over) for every query that touches row-level-security tables;
 * a query on the plain client carries no tenant and sees no rows once the
 * policies are enabled.
 */
export function runInTenantTransaction<T>(
  client: PrismaClient,
  context: TenantContext,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await applyTenantContext(tx, context)
    return work(tx)
  })
}
