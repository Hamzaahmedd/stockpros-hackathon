/**
 * The customer notice is fire-and-forget: it runs after the limit change has
 * committed, so whatever goes wrong here must be logged, never thrown.
 */
const mockPrisma: any = { user: { findUnique: jest.fn() } }
jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: mockLogger,
}))

const mockEnqueue = jest.fn()
jest.mock('../../notifications/public', () => ({
  enqueueSpendLimitChangedEmail: (...args: unknown[]) => mockEnqueue(...args),
}))

jest.mock('../../payments/public', () => ({
  formatAmount: (paisa: number) => `Rs ${paisa / 100}`,
}))

import config from '@/config'
import {
  NO_SPEND_LIMIT_LABEL,
  notifySpendLimitChanged,
} from '../spend-limit-notice'

const USER = '0191e4a0-0000-7000-8000-0000000000bb'
const change = {
  userId: USER,
  previousLimitPaisa: 50_000 as number | null,
  monthlyLimitPaisa: 120_000 as number | null,
  ticketRef: 'SUP-4821',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.user.findUnique.mockResolvedValue({
    email: 'sam@fund.com',
    displayName: 'Sam Lee',
  })
  mockEnqueue.mockResolvedValue(undefined)
})

describe('notifySpendLimitChanged', () => {
  it('queues one email with the previous limit, new limit, ticket and usage link', async () => {
    await notifySpendLimitChanged(change)

    expect(mockEnqueue).toHaveBeenCalledTimes(1)
    expect(mockEnqueue).toHaveBeenCalledWith({
      to: 'sam@fund.com',
      userId: USER,
      userName: 'Sam Lee',
      previousLimit: 'Rs 500',
      newLimit: 'Rs 1200',
      ticketRef: 'SUP-4821',
      usageUrl: `${config.server.frontendUrl}/usage`,
    })
  })

  it('says "No limit" when the limit was removed', async () => {
    await notifySpendLimitChanged({ ...change, monthlyLimitPaisa: null })
    expect(mockEnqueue.mock.calls[0][0]).toMatchObject({
      previousLimit: 'Rs 500',
      newLimit: NO_SPEND_LIMIT_LABEL,
    })
  })

  it('says "No limit" as the previous value when a limit is first set', async () => {
    await notifySpendLimitChanged({ ...change, previousLimitPaisa: null })
    expect(mockEnqueue.mock.calls[0][0]).toMatchObject({
      previousLimit: NO_SPEND_LIMIT_LABEL,
      newLimit: 'Rs 1200',
    })
  })

  it('logs identifiers only, never the address or name', async () => {
    await notifySpendLimitChanged(change)

    const logged = JSON.stringify(mockLogger.info.mock.calls)
    expect(logged).toContain(USER)
    expect(logged).toContain('SUP-4821')
    expect(logged).not.toContain('sam@fund.com')
    expect(logged).not.toContain('Sam Lee')
  })

  it('skips quietly when the user no longer exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)

    await expect(notifySpendLimitChanged(change)).resolves.toBeUndefined()
    expect(mockEnqueue).not.toHaveBeenCalled()
    expect(mockLogger.warn).toHaveBeenCalledTimes(1)
  })

  it('never throws when the queue fails; it logs and moves on', async () => {
    mockEnqueue.mockRejectedValue(new Error('redis down'))

    await expect(notifySpendLimitChanged(change)).resolves.toBeUndefined()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not queue a spend limit change notice'),
    )
  })

  it('never throws when the user lookup fails', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('db down'))

    await expect(notifySpendLimitChanged(change)).resolves.toBeUndefined()
    expect(mockEnqueue).not.toHaveBeenCalled()
    expect(mockLogger.warn).toHaveBeenCalledTimes(1)
  })
})
