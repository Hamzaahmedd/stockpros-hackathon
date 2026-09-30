import { CreditLedgerType, TeamRole } from '@prisma/client'
import { ForbiddenError, NotFoundError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import type { ActiveMembership } from '../../shared/infrastructure/team-access'
import {
  recordUsage,
  resolveUsageWindowStart,
  SEARCH_USAGE_FEATURE,
} from '../payments/public'
import { SEARCH_RESULT_LIMIT, TOP_SYMBOLS_LIMIT } from './constants'
import { requireMembership } from './service'
import type { JsonValue } from './validation'

const canManage = (
  membership: ActiveMembership,
  createdBy: string,
  userId: string,
) =>
  createdBy === userId ||
  membership.role === TeamRole.OWNER ||
  membership.role === TeamRole.ADMIN

// ─── Shared watchlists ────────────────────────────────────────────────────────

export async function listSharedWatchlists(userId: string) {
  const { teamId } = await requireMembership(userId)
  return prisma.sharedWatchlist.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createSharedWatchlist(
  userId: string,
  input: { name: string; symbols: string[] },
) {
  const { teamId } = await requireMembership(userId)
  return prisma.sharedWatchlist.create({
    data: {
      teamId,
      name: input.name,
      symbols: [...new Set(input.symbols)],
      createdBy: userId,
    },
  })
}

export async function deleteSharedWatchlist(userId: string, id: string) {
  const membership = await requireMembership(userId)
  const item = await prisma.sharedWatchlist.findFirst({
    where: { id, teamId: membership.teamId },
  })
  if (!item) throw new NotFoundError('Shared watchlist not found')
  if (!canManage(membership, item.createdBy, userId)) {
    throw new ForbiddenError('Only the creator or an admin can delete this')
  }
  await prisma.sharedWatchlist.delete({ where: { id } })
}

// ─── Shared screeners ─────────────────────────────────────────────────────────

export async function listSharedScreeners(userId: string) {
  const { teamId } = await requireMembership(userId)
  return prisma.sharedScreener.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createSharedScreener(
  userId: string,
  input: { name: string; criteria: Record<string, JsonValue> },
) {
  const { teamId } = await requireMembership(userId)
  return prisma.sharedScreener.create({
    data: {
      teamId,
      name: input.name,
      criteria: input.criteria,
      createdBy: userId,
    },
  })
}

export async function deleteSharedScreener(userId: string, id: string) {
  const membership = await requireMembership(userId)
  const item = await prisma.sharedScreener.findFirst({
    where: { id, teamId: membership.teamId },
  })
  if (!item) throw new NotFoundError('Shared screener not found')
  if (!canManage(membership, item.createdBy, userId)) {
    throw new ForbiddenError('Only the creator or an admin can delete this')
  }
  await prisma.sharedScreener.delete({ where: { id } })
}

// ─── Research notes ───────────────────────────────────────────────────────────

export async function listResearchNotes(userId: string, symbol?: string) {
  const { teamId } = await requireMembership(userId)
  return prisma.sharedResearchNote.findMany({
    where: { teamId, ...(symbol ? { symbol: symbol.toUpperCase() } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

export async function createResearchNote(
  userId: string,
  input: { symbol: string; content: string },
) {
  const { teamId } = await requireMembership(userId)
  return prisma.sharedResearchNote.create({
    data: {
      teamId,
      symbol: input.symbol,
      content: input.content,
      authorId: userId,
    },
  })
}

export async function deleteResearchNote(userId: string, id: string) {
  const membership = await requireMembership(userId)
  const item = await prisma.sharedResearchNote.findFirst({
    where: { id, teamId: membership.teamId },
  })
  if (!item) throw new NotFoundError('Research note not found')
  if (!canManage(membership, item.authorId, userId)) {
    throw new ForbiddenError('Only the author or an admin can delete this')
  }
  await prisma.sharedResearchNote.delete({ where: { id } })
}

// ─── Workspace search ─────────────────────────────────────────────────────────

/**
 * Searches every shared asset plus the AI forecasts/decisions the team's
 * members have saved. Also recorded as unmetered usage for analytics.
 */
export async function searchWorkspace(userId: string, query: string) {
  const membership = await requireMembership(userId)
  const { teamId } = membership
  const symbol = query.toUpperCase()
  const contains = { contains: query, mode: 'insensitive' as const }

  const [watchlists, screeners, notes, forecasts] = await Promise.all([
    prisma.sharedWatchlist.findMany({
      where: { teamId, OR: [{ name: contains }, { symbols: { has: symbol } }] },
      take: SEARCH_RESULT_LIMIT,
    }),
    prisma.sharedScreener.findMany({
      where: { teamId, name: contains },
      take: SEARCH_RESULT_LIMIT,
    }),
    prisma.sharedResearchNote.findMany({
      where: { teamId, OR: [{ content: contains }, { symbol }] },
      orderBy: { createdAt: 'desc' },
      take: SEARCH_RESULT_LIMIT,
    }),
    prisma.decisionResult.findMany({
      where: {
        symbol,
        run: { user: { teamMembers: { some: { teamId } } } },
      },
      select: {
        id: true,
        symbol: true,
        marketDecision: true,
        portfolioDecision: true,
        confidence: true,
        run: { select: { id: true, userId: true, runAt: true } },
      },
      orderBy: { run: { runAt: 'desc' } },
      take: SEARCH_RESULT_LIMIT,
    }),
  ])

  await recordUsage({ userId, membership }, SEARCH_USAGE_FEATURE, query)
  return { watchlists, screeners, notes, forecasts }
}

// ─── Usage analytics ──────────────────────────────────────────────────────────

export async function getTeamAnalytics(userId: string) {
  const membership = await requireMembership(userId, { admin: true })
  const { teamId } = membership
  const windowStart = await resolveUsageWindowStart({ userId, membership })
  const inWindow = { teamId, createdAt: { gte: windowStart } }

  const [byMemberFeature, topSymbols, members] = await Promise.all([
    prisma.usageEvent.groupBy({
      by: ['userId', 'feature'],
      where: inWindow,
      _count: { _all: true },
      _sum: { costPaisa: true },
    }),
    prisma.usageEvent.groupBy({
      by: ['symbol'],
      where: { ...inWindow, symbol: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { symbol: 'desc' } },
      take: TOP_SYMBOLS_LIMIT,
    }),
    prisma.teamMember.findMany({
      where: { teamId },
      select: {
        userId: true,
        role: true,
        monthlyCreditLimitPaisa: true,
        user: { select: { displayName: true } },
      },
    }),
  ])

  const memberIds = members.map((m) => m.userId)
  const [tracked, ledger] = await Promise.all([
    prisma.watchlist.findMany({
      where: { userId: { in: memberIds } },
      distinct: ['symbol'],
      select: { symbol: true },
    }),
    prisma.creditLedger.groupBy({
      by: ['userId'],
      where: {
        teamId,
        type: CreditLedgerType.OVERAGE_CONSUMPTION,
        createdAt: { gte: windowStart },
      },
      _sum: { amountPaisa: true },
    }),
  ])

  const creditSpent = new Map(
    ledger.map((row) => [row.userId, Math.abs(row._sum.amountPaisa ?? 0)]),
  )
  const totals: Record<string, number> = {}
  const perMember = members.map((member) => {
    const features: Record<string, number> = {}
    for (const row of byMemberFeature.filter(
      (r) => r.userId === member.userId,
    )) {
      features[row.feature] = row._count._all
      totals[row.feature] = (totals[row.feature] ?? 0) + row._count._all
    }
    return {
      userId: member.userId,
      displayName: member.user.displayName,
      role: member.role,
      usageByFeature: features,
      creditSpentPaisa: creditSpent.get(member.userId) ?? 0,
      monthlyCreditLimitPaisa: member.monthlyCreditLimitPaisa,
    }
  })

  return {
    windowStart,
    totalsByFeature: totals,
    perMember,
    topSymbols: topSymbols.map((row) => ({
      symbol: row.symbol,
      count: row._count._all,
    })),
    activeTickers: tracked.map((row) => row.symbol),
  }
}
