const failedHandlers: Record<string, (job: unknown, err: Error) => void> = {}

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    add: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation((name: string) => ({
    on: jest.fn(
      (event: string, handler: (job: unknown, err: Error) => void) => {
        if (event === 'failed') failedHandlers[name] = handler
      },
    ),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}))

jest.mock('../infrastructure/watchlist-job', () => ({
  runEarningsAlertJob: jest.fn(),
  runDividendAlertJob: jest.fn(),
  runAnalystRatingJob: jest.fn(),
  runNewsAlertJob: jest.fn(),
  runSecFilingJob: jest.fn(),
  runAiZoneRecomputeJob: jest.fn(),
}))
jest.mock('../../notifications/public', () => ({
  sendDailyDigestsToAllSubscribers: jest.fn(),
  runNotificationCleanupJob: jest.fn(),
}))
jest.mock('../../../shared/infrastructure/cache', () => ({
  getRedisClient: jest.fn().mockReturnValue({ host: 'localhost' }),
}))
jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))
const mockAlertJobFailure = jest.fn()
jest.mock('../../../shared/infrastructure/job-alert', () => ({
  alertJobFailure: (...args: unknown[]) => mockAlertJobFailure(...args),
}))

import { logger } from '../../../shared/infrastructure/logger'
import {
  startCronScheduler,
  stopCronScheduler,
} from '../infrastructure/scheduler'

afterEach(async () => {
  await stopCronScheduler()
})

describe('watchlist cron failure alerts', () => {
  it('logs a failed job and alerts ops with the cron it belongs to', async () => {
    await startCronScheduler()
    const [name] = Object.keys(failedHandlers)
    const failed = { id: 'j1', attemptsMade: 3, opts: { attempts: 3 } }
    const error = new Error('db down')

    failedHandlers[name](failed, error)

    expect(logger.error).toHaveBeenCalledWith(
      `[CronScheduler] ${name} failed: db down`,
    )
    expect(mockAlertJobFailure).toHaveBeenCalledWith({
      queue: 'watchlist-cron',
      name,
      job: failed,
      error,
    })
  })

  it('registers a failure handler for every cron, including the digest and cleanup', async () => {
    await startCronScheduler()
    expect(Object.keys(failedHandlers)).toEqual(
      expect.arrayContaining(['notification-cleanup']),
    )
    expect(Object.keys(failedHandlers).length).toBeGreaterThanOrEqual(6)
  })
})
