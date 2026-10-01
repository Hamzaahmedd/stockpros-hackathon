import config from '@/config'
import { PaymentKind, PaymentStatus } from '@prisma/client'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import { enqueuePaymentReceiptEmail } from '../notifications/public'
import { KIND_DESCRIPTIONS, receiptNumber } from './receipts'

const formatAmount = (amountPaisa: number): string =>
  `Rs ${(amountPaisa / 100).toLocaleString('en-PK')}`

const formatDate = (date: Date): string =>
  date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

/**
 * Emails the workspace's billing contact (the owner when none is set) once a
 * team payment has completed. Best-effort: the payment is already applied, so
 * a failure here is logged and never fails the webhook.
 */
export async function sendTeamReceiptEmail(
  transactionId: string,
): Promise<void> {
  try {
    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
    })
    if (
      !transaction?.teamId ||
      transaction.status !== PaymentStatus.COMPLETED
    ) {
      return
    }
    const team = await prisma.team.findUnique({
      where: { id: transaction.teamId },
      select: {
        name: true,
        billingEmail: true,
        owner: { select: { email: true } },
      },
    })
    if (!team) return

    await enqueuePaymentReceiptEmail({
      to: team.billingEmail ?? team.owner.email,
      transactionId: transaction.id,
      teamId: transaction.teamId,
      teamName: team.name,
      referenceNumber: receiptNumber(transaction.id, transaction.createdAt),
      description: KIND_DESCRIPTIONS[transaction.kind as PaymentKind],
      amount: formatAmount(transaction.amountPaisa),
      seatCount: transaction.seatCount,
      paidOn: formatDate(transaction.updatedAt),
      manageUrl: `${config.server.frontendUrl}/teams`,
    })
  } catch (error) {
    logger.error(
      `[Payments] Failed to queue receipt email: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
