jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    decisionRun: { create: jest.fn(), findFirst: jest.fn() },
    decisionResult: { createMany: jest.fn() },
  },
}))

import { prisma } from '../../../shared/infrastructure/database'
import { getLatestDecisionRun, persistDecisionRun } from '../repository'
import type { DecisionResult } from '../types'

const mockRun = prisma.decisionRun as unknown as { [m: string]: jest.Mock }
const mockResult = prisma.decisionResult as unknown as {
  [m: string]: jest.Mock
}

beforeEach(() => jest.clearAllMocks())

describe('persistDecisionRun', () => {
  it('creates a decision run and its results, defaulting a missing sector to null', async () => {
    mockRun.create.mockResolvedValue({ id: 'run-1' })
    mockResult.createMany.mockResolvedValue({ count: 1 })

    const results: DecisionResult[] = [
      {
        symbol: 'AAPL',
        marketDecision: 'BUY',
        portfolioDecision: 'HOLD',
        confidence: 'HIGH',
        riskLevel: 'LOW',
        reasoning: { summary: 'ok' },
        exposure: { pct: 5 },
        actionGuidance: { note: 'n/a' },
      } as any,
    ]

    await persistDecisionRun('user-1', 'portfolio-1', results)

    expect(mockRun.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', portfolioId: 'portfolio-1' },
    })
    expect(mockResult.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          runId: 'run-1',
          symbol: 'AAPL',
          sector: null,
        }),
      ],
    })
  })

  it('passes through an explicit sector when present', async () => {
    mockRun.create.mockResolvedValue({ id: 'run-2' })
    mockResult.createMany.mockResolvedValue({ count: 1 })

    await persistDecisionRun('user-1', 'portfolio-1', [
      { symbol: 'AAPL', sector: 'Technology' } as any,
    ])

    expect(mockResult.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ sector: 'Technology' })],
    })
  })
})

describe('getLatestDecisionRun', () => {
  it('returns the most recent decision run with its results', async () => {
    mockRun.findFirst.mockResolvedValue({ id: 'run-1', results: [] })

    const result = await getLatestDecisionRun('user-1')

    expect(mockRun.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { runAt: 'desc' },
      include: { results: true },
    })
    expect(result).toEqual({ id: 'run-1', results: [] })
  })

  it('returns null when the user has no decision runs', async () => {
    mockRun.findFirst.mockResolvedValue(null)
    expect(await getLatestDecisionRun('user-1')).toBeNull()
  })
})
