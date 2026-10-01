import { PaymentKind, PaymentStatus } from '@prisma/client'
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import {
  can,
  getActiveMembership,
  TeamPermission,
} from '../../shared/infrastructure/team-access'

export interface TransactionQuery {
  limit: number
  cursor?: string
}

/** Paid states only: a receipt is proof of payment, so pending and failed attempts are not listed. */
const RECEIPT_STATUSES: PaymentStatus[] = [
  PaymentStatus.COMPLETED,
  PaymentStatus.REFUNDED,
]

const PER_SEAT_KINDS: ReadonlySet<PaymentKind> = new Set([
  PaymentKind.SUBSCRIPTION,
  PaymentKind.SEAT_ADDITION,
])

export const KIND_DESCRIPTIONS: Record<PaymentKind, string> = {
  [PaymentKind.SUBSCRIPTION]: 'Team plan subscription',
  [PaymentKind.SEAT_ADDITION]: 'Additional team seats',
  [PaymentKind.TOPUP]: 'Credit top-up',
}

/**
 * Stable reference derived from the transaction id. The id is a UUIDv7, whose
 * leading characters are a timestamp shared by payments made weeks apart, so
 * the random tail is what is used.
 */
export const receiptNumber = (id: string, createdAt: Date): string =>
  `SP-${createdAt.getUTCFullYear()}-${id.replaceAll('-', '').slice(-8).toUpperCase()}`

async function requireBillingTeam(userId: string): Promise<string> {
  const membership = await getActiveMembership(userId)
  if (!membership) {
    throw new NotFoundError('You are not part of an active team workspace')
  }
  if (!can(membership.role, TeamPermission.BILLING_MANAGE)) {
    throw new ForbiddenError(
      'Only a team owner or admin can view billing history',
    )
  }
  return membership.teamId
}

export async function listTeamTransactions(
  userId: string,
  query: TransactionQuery,
) {
  const teamId = await requireBillingTeam(userId)
  if (query.cursor) {
    // A cursor must be one of this workspace's own transactions.
    const own = await prisma.paymentTransaction.findFirst({
      where: { id: query.cursor, teamId },
      select: { id: true },
    })
    if (!own) throw new BadRequestError('Invalid cursor')
  }

  // One extra row tells us whether another page exists without a count query.
  const rows = await prisma.paymentTransaction.findMany({
    where: { teamId, status: { in: RECEIPT_STATUSES } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    select: {
      id: true,
      kind: true,
      status: true,
      amountPaisa: true,
      currency: true,
      seatCount: true,
      createdAt: true,
    },
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  })
  const hasMore = rows.length > query.limit
  const page = hasMore ? rows.slice(0, query.limit) : rows

  return {
    entries: page.map((row) => ({
      id: row.id,
      referenceNumber: receiptNumber(row.id, row.createdAt),
      kind: row.kind,
      description: KIND_DESCRIPTIONS[row.kind],
      status: row.status,
      amountPaisa: row.amountPaisa,
      currency: row.currency,
      seatCount: row.seatCount,
      createdAt: row.createdAt,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  }
}

/** Fetched by id AND team, so another workspace's receipt is indistinguishable from a missing one. */
export async function getTeamReceipt(userId: string, transactionId: string) {
  const teamId = await requireBillingTeam(userId)
  const transaction = await prisma.paymentTransaction.findFirst({
    where: {
      id: transactionId,
      teamId,
      status: { in: RECEIPT_STATUSES },
    },
    select: {
      id: true,
      kind: true,
      status: true,
      amountPaisa: true,
      currency: true,
      seatCount: true,
      paymentMethod: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  if (!transaction) throw new NotFoundError('Receipt not found')

  const team = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
    select: {
      name: true,
      billingEmail: true,
      owner: { select: { email: true } },
    },
  })

  return {
    id: transaction.id,
    referenceNumber: receiptNumber(transaction.id, transaction.createdAt),
    kind: transaction.kind,
    description: KIND_DESCRIPTIONS[transaction.kind],
    status: transaction.status,
    amountPaisa: transaction.amountPaisa,
    currency: transaction.currency,
    seatCount: transaction.seatCount,
    unitPricePaisa: PER_SEAT_KINDS.has(transaction.kind)
      ? Math.round(transaction.amountPaisa / transaction.seatCount)
      : null,
    paymentMethod: transaction.paymentMethod,
    paidAt: transaction.updatedAt,
    teamName: team.name,
    billedTo: team.billingEmail ?? team.owner.email,
  }
}
