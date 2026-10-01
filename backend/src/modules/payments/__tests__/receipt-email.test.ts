const mockPrisma: any = {
  paymentTransaction: { findUnique: jest.fn() },
  team: { findUnique: jest.fn() },
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))
jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}))
jest.mock('../../notifications/public', () => ({
  enqueuePaymentReceiptEmail: jest.fn(),
}))

import config from '@/config'
import { PaymentKind } from '@prisma/client'
import { logger } from '../../../shared/infrastructure/logger'
import { enqueuePaymentReceiptEmail } from '../../notifications/public'
import { sendTeamReceiptEmail } from '../receipt-email'

const transaction = (overrides: Record<string, unknown> = {}) => ({
  id: '0190a1b2-0000-7000-8000-0000000000c1',
  teamId: 'team-1',
  status: 'COMPLETED',
  kind: PaymentKind.SUBSCRIPTION,
  amountPaisa: 1_499_800,
  seatCount: 2,
  createdAt: new Date('2030-03-05T10:00:00Z'),
  updatedAt: new Date('2030-03-05T10:05:00Z'),
  ...overrides,
})

const team = (billingEmail: string | null = null) => ({
  name: 'Alpha Fund',
  billingEmail,
  owner: { email: 'owner@fund.com' },
})

beforeEach(() => {
  jest.resetAllMocks()
  mockPrisma.paymentTransaction.findUnique.mockResolvedValue(transaction())
  mockPrisma.team.findUnique.mockResolvedValue(team())
})

describe('sendTeamReceiptEmail', () => {
  it('queues a receipt to the owner when there is no billing contact', async () => {
    await sendTeamReceiptEmail('txn-1')

    expect(enqueuePaymentReceiptEmail).toHaveBeenCalledWith({
      to: 'owner@fund.com',
      transactionId: '0190a1b2-0000-7000-8000-0000000000c1',
      teamId: 'team-1',
      teamName: 'Alpha Fund',
      referenceNumber: 'SP-2030-000000C1',
      description: 'Team plan subscription',
      amount: 'Rs 14,998',
      seatCount: 2,
      paidOn: 'Mar 5, 2030',
      manageUrl: `${config.server.frontendUrl}/teams`,
    })
  })

  it('prefers the billing contact', async () => {
    mockPrisma.team.findUnique.mockResolvedValue(team('billing@fund.com'))
    await sendTeamReceiptEmail('txn-1')
    expect((enqueuePaymentReceiptEmail as jest.Mock).mock.calls[0][0].to).toBe(
      'billing@fund.com',
    )
  })

  it.each([
    ['is unknown', null],
    ['has no team (a personal payment)', transaction({ teamId: null })],
    ['is not completed', transaction({ status: 'PENDING' })],
  ])('sends nothing when the transaction %s', async (_label, row) => {
    mockPrisma.paymentTransaction.findUnique.mockResolvedValue(row)
    await sendTeamReceiptEmail('txn-1')
    expect(enqueuePaymentReceiptEmail).not.toHaveBeenCalled()
  })

  it('sends nothing when the team no longer exists', async () => {
    mockPrisma.team.findUnique.mockResolvedValue(null)
    await sendTeamReceiptEmail('txn-1')
    expect(enqueuePaymentReceiptEmail).not.toHaveBeenCalled()
  })

  it('never throws: a queue failure is logged, without the address', async () => {
    ;(enqueuePaymentReceiptEmail as jest.Mock).mockRejectedValue(
      new Error('redis down'),
    )
    await expect(sendTeamReceiptEmail('txn-1')).resolves.toBeUndefined()

    const message = (logger.error as jest.Mock).mock.calls[0][0] as string
    expect(message).toContain('redis down')
    expect(message).not.toContain('@')
  })

  it('reports a non-Error failure too', async () => {
    mockPrisma.paymentTransaction.findUnique.mockRejectedValue('boom')
    await expect(sendTeamReceiptEmail('txn-1')).resolves.toBeUndefined()
    expect((logger.error as jest.Mock).mock.calls[0][0]).toContain('boom')
  })
})
