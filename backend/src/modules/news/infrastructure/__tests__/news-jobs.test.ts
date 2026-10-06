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

jest.mock('../../../../shared/infrastructure/cache', () => ({
  getRedisClient: jest.fn().mockReturnValue({ host: 'localhost' }),
}))
jest.mock('../../../../shared/infrastructure/database', () => ({ prisma: {} }))
jest.mock('../news-fetcher', () => ({
  fetchAndIngestAllSymbols: jest.fn(),
  fetchAndIngestGeneralNews: jest.fn(),
}))
jest.mock('../../../../shared/infrastructure/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))
const mockAlertJobFailure = jest.fn()
jest.mock('../../../../shared/infrastructure/job-alert', () => ({
  alertJobFailure: (...args: unknown[]) => mockAlertJobFailure(...args),
}))

import { logger } from '../../../../shared/infrastructure/logger'
import { startNewsCronJobs, stopNewsCronJobs } from '../news-jobs'

afterEach(async () => {
  await stopNewsCronJobs()
})

describe('news cron failure alerts', () => {
  it('logs a failed job and alerts ops with the cron it belongs to', async () => {
    await startNewsCronJobs()
    const failed = { id: 'j1', attemptsMade: 3, opts: { attempts: 3 } }
    const error = new Error('provider down')

    failedHandlers['news-symbol-fetch'](failed, error)

    expect(logger.error).toHaveBeenCalledWith(
      '[NewsCron] news-symbol-fetch failed: provider down',
    )
    expect(mockAlertJobFailure).toHaveBeenCalledWith({
      queue: 'news-cron',
      name: 'news-symbol-fetch',
      job: failed,
      error,
    })
  })

  it('registers a failure handler for every cron', async () => {
    await startNewsCronJobs()
    expect(Object.keys(failedHandlers).sort()).toEqual([
      'news-cleanup',
      'news-general-fetch',
      'news-symbol-fetch',
    ])
  })
})
