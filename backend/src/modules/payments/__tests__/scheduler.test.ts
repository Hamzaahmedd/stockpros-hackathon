const queueAdd = jest.fn().mockResolvedValue(undefined)
const queueClose = jest.fn().mockResolvedValue(undefined)
const workerClose = jest.fn().mockResolvedValue(undefined)
const processors: Record<string, () => Promise<void>> = {}

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    add: queueAdd,
    close: queueClose,
  })),
  Worker: jest
    .fn()
    .mockImplementation((name: string, processor: () => Promise<void>) => {
      processors[name] = processor
      return { on: jest.fn(), close: workerClose }
    }),
}))

jest.mock('../../../shared/infrastructure/cache', () => ({
  getRedisClient: jest.fn(),
}))

jest.mock('../subscription-job', () => ({
  runSubscriptionExpiryJob: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../teams/public', () => ({
  runTeamInviteCleanupJob: jest.fn().mockResolvedValue(0),
}))

import config from '@/config'
import { getRedisClient } from '../../../shared/infrastructure/cache'
import { runTeamInviteCleanupJob } from '../../teams/public'
import {
  startSubscriptionCronJobs,
  stopSubscriptionCronJobs,
} from '../scheduler'
import { runSubscriptionExpiryJob } from '../subscription-job'

const features = config.features as { enableSubscriptionCron: boolean }
const original = features.enableSubscriptionCron

beforeEach(() => {
  jest.clearAllMocks()
  features.enableSubscriptionCron = true
  ;(getRedisClient as jest.Mock).mockReturnValue({ host: 'localhost' })
})

afterEach(async () => {
  features.enableSubscriptionCron = original
  await stopSubscriptionCronJobs() // module keeps its workers between tests
})

describe('startSubscriptionCronJobs', () => {
  it('registers the daily subscription-expiry job and the expired-invite cleanup as repeatable jobs', async () => {
    await startSubscriptionCronJobs()

    const registered = queueAdd.mock.calls.map(([name, , opts]) => [
      name,
      opts.repeat.pattern,
    ])
    expect(registered).toEqual([
      ['subscription-expiry', '0 7 * * *'],
      ['team-invite-cleanup', '30 7 * * *'],
    ])
  })

  it("runs each job's own handler when its worker fires", async () => {
    await startSubscriptionCronJobs()

    await processors['team-invite-cleanup']()
    expect(runTeamInviteCleanupJob).toHaveBeenCalledTimes(1)
    expect(runSubscriptionExpiryJob).not.toHaveBeenCalled()

    await processors['subscription-expiry']()
    expect(runSubscriptionExpiryJob).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the cron feature flag is off', async () => {
    features.enableSubscriptionCron = false
    await startSubscriptionCronJobs()
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('does nothing (and does not crash) without a Redis connection', async () => {
    ;(getRedisClient as jest.Mock).mockReturnValue(null)
    await startSubscriptionCronJobs()
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('stop closes every worker and queue that was started, and a second stop is a no-op', async () => {
    await startSubscriptionCronJobs()
    await stopSubscriptionCronJobs()
    expect(workerClose).toHaveBeenCalledTimes(2)
    expect(queueClose).toHaveBeenCalledTimes(2)

    await stopSubscriptionCronJobs()
    expect(workerClose).toHaveBeenCalledTimes(2) // nothing closed twice
    expect(queueClose).toHaveBeenCalledTimes(2)
  })
})

describe('getSubscriptionQueues', () => {
  it('exposes the live cron queues for admin queue-health inspection', async () => {
    const { getSubscriptionQueues } = await import('../scheduler')
    expect(Array.isArray(getSubscriptionQueues())).toBe(true)
  })
})
