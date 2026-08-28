import { prisma } from '../../shared/infrastructure/database'
import type { DecisionResult } from './types'

export const persistDecisionRun = async (
  userId:      string,
  portfolioId: string,
  results:     DecisionResult[],
): Promise<void> => {
  const run = await prisma.decisionRun.create({
    data: { userId, portfolioId },
  })

  await prisma.decisionResult.createMany({
    data: results.map(r => ({
      runId:             run.id,
      symbol:            r.symbol,
      sector:            r.sector ?? null,
      marketDecision:    r.marketDecision,
      portfolioDecision: r.portfolioDecision,
      confidence:        r.confidence,
      riskLevel:         r.riskLevel,
      reasoning:         r.reasoning,
      exposure:          r.exposure,
      actionGuidance:    r.actionGuidance,
    })),
  })
}

export const getLatestDecisionRun = async (userId: string) => {
  const run = await prisma.decisionRun.findFirst({
    where:   { userId },
    orderBy: { runAt: 'desc' },
    include: { results: true },
  })
  return run
}
