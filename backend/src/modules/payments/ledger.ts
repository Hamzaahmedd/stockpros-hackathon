import type { CreditLedgerType } from '@prisma/client'
import { ForbiddenError, NotFoundError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import {
  getActiveMembership,
  isTeamAdminRole,
} from '../../shared/infrastructure/team-access'
import { SubscriptionScope } from './constants'

export interface LedgerEntry {
  id: string
  /** Signed: purchases and refunds are positive, overage consumption is negative. */
  amountPaisa: number
  type: CreditLedgerType
  description: string
  createdAt: Date
  /** True when the movement was on the shared workspace pool rather than a personal balance. */
  isTeamPool: boolean
  /** Who spent or bought — only populated for the workspace-wide view. */
  memberName?: string
}

export interface LedgerPage {
  scope: SubscriptionScope
  /** Current balance of the pool being viewed (personal or workspace). */
  balanceInPaisa: number
  entries: LedgerEntry[]
  /** Pass back as `cursor` to fetch the next (older) page; null when there is none. */
  nextCursor: string | null
}

export interface LedgerQuery {
  scope: SubscriptionScope
  limit: number
  cursor?: string
}

/** Resolves who the query is about: the caller's own activity, or (admins) the whole workspace pool. */
async function resolveTarget(userId: string, scope: SubscriptionScope) {
  if (scope === SubscriptionScope.USER) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { creditBalanceInPaisa: true },
    })
    return {
      where: { userId },
      balanceInPaisa: user.creditBalanceInPaisa,
    }
  }

  const membership = await getActiveMembership(userId)
  if (!membership) {
    throw new NotFoundError('You are not part of an active team workspace')
  }
  if (!isTeamAdminRole(membership.role)) {
    throw new ForbiddenError(
      'Only a team owner or admin can view the workspace credit history',
    )
  }
  const team = await prisma.team.findUniqueOrThrow({
    where: { id: membership.teamId },
    select: { creditBalanceInPaisa: true },
  })
  return {
    where: { teamId: membership.teamId },
    balanceInPaisa: team.creditBalanceInPaisa,
  }
}

/**
 * Newest-first, cursor-paginated credit history. Read-only over the
 * append-only `credit_ledger`; internal fields (tracker ids) are not exposed.
 */
export async function getCreditLedger(
  userId: string,
  query: LedgerQuery,
): Promise<LedgerPage> {
  const target = await resolveTarget(userId, query.scope)

  // One extra row tells us whether another page exists without a count query.
  const rows = await prisma.creditLedger.findMany({
    where: target.where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  })

  const hasMore = rows.length > query.limit
  const page = hasMore ? rows.slice(0, query.limit) : rows

  const names = new Map<string, string>()
  if (query.scope === SubscriptionScope.TEAM) {
    const ids = [
      ...new Set(
        page.map((row) => row.userId).filter((id): id is string => !!id),
      ),
    ]
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true },
    })
    users.forEach((user) => names.set(user.id, user.displayName))
  }

  return {
    scope: query.scope,
    balanceInPaisa: target.balanceInPaisa,
    entries: page.map((row) => ({
      id: row.id,
      amountPaisa: row.amountPaisa,
      type: row.type,
      description: row.description,
      createdAt: row.createdAt,
      isTeamPool: row.teamId !== null,
      ...(row.userId && names.has(row.userId)
        ? { memberName: names.get(row.userId) }
        : {}),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  }
}
