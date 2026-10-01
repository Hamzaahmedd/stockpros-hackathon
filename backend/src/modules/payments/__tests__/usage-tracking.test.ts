jest.mock('../../../shared/infrastructure/team-access', () => ({
  getActiveMembership: jest.fn(),
}))
jest.mock('../credits', () => ({
  recordUsage: jest.fn(),
}))
jest.mock('../constants', () => ({
  SEARCH_USAGE_FEATURE: 'search',
}))
jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: { warn: jest.fn() },
}))

import { recordUsage } from '../credits'
import { logger } from '../../../shared/infrastructure/logger'
import { getActiveMembership } from '../../../shared/infrastructure/team-access'
import { trackSearchUsage } from '../usage-tracking'

const membership = { teamId: 't1', role: 'MEMBER' }
const flush = () => new Promise((resolve) => setImmediate(resolve))

const run = (plan: string | undefined, query: unknown = { q: 'AAPL' }) => {
  const req: any = { user: plan ? { userId: 'u1', plan } : undefined, query }
  const next = jest.fn()
  trackSearchUsage(req, {} as any, next)
  return next
}

afterEach(() => jest.resetAllMocks())

describe('trackSearchUsage', () => {
  it('records usage for TEAM members and calls next immediately', async () => {
    ;(getActiveMembership as jest.Mock).mockResolvedValue(membership)
    const next = run('TEAM')
    expect(next).toHaveBeenCalledWith()
    await flush()
    expect(recordUsage).toHaveBeenCalledWith(
      { userId: 'u1', membership },
      'search',
      'AAPL',
    )
  })

  it('passes an undefined query when q is not a string', async () => {
    ;(getActiveMembership as jest.Mock).mockResolvedValue(membership)
    run('TEAM', { q: ['a', 'b'] })
    await flush()
    expect(recordUsage).toHaveBeenCalledWith(
      { userId: 'u1', membership },
      'search',
      undefined,
    )
  })

  it('skips recording when the TEAM user has no active membership', async () => {
    ;(getActiveMembership as jest.Mock).mockResolvedValue(null)
    const next = run('TEAM')
    await flush()
    expect(next).toHaveBeenCalledWith()
    expect(recordUsage).not.toHaveBeenCalled()
  })

  it.each(['FREE', 'PRO', undefined])('does nothing for %s', async (plan) => {
    const next = run(plan)
    await flush()
    expect(next).toHaveBeenCalledWith()
    expect(getActiveMembership).not.toHaveBeenCalled()
  })

  it('logs a warning and still proceeds when recording fails', async () => {
    ;(getActiveMembership as jest.Mock).mockResolvedValue(membership)
    ;(recordUsage as jest.Mock).mockRejectedValue(new Error('db down'))
    const next = run('TEAM')
    await flush()
    expect(next).toHaveBeenCalledWith()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('db down'))
  })

  it('stringifies non-Error rejections in the warning', async () => {
    ;(getActiveMembership as jest.Mock).mockRejectedValue('weird')
    run('TEAM')
    await flush()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('weird'))
  })
})
