import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeBoot } from './test-fixtures'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/shared/api/axios', () => ({ default: api }))

import { announcementService } from './services'

beforeEach(() => {
  vi.clearAllMocks()
  api.post.mockResolvedValue({ data: { success: true } })
})

describe('announcementService', () => {
  it('unwraps the boot payload from the response envelope', async () => {
    const boot = makeBoot()
    api.get.mockResolvedValue({ data: { success: true, data: boot } })

    await expect(announcementService.getBoot()).resolves.toEqual(boot)
    expect(api.get).toHaveBeenCalledWith('/api/v1/announcements/boot')
  })

  it('rejects a body that is not the envelope', async () => {
    api.get.mockResolvedValue({ data: '<html>proxy error</html>' })
    await expect(announcementService.getBoot()).rejects.toThrow()
  })

  it('posts dismissals, single reads and read-all to the right routes', async () => {
    await announcementService.dismiss('a1')
    await announcementService.markSeen('a1')
    await announcementService.markAllSeen()

    expect(api.post.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/announcements/a1/dismiss',
      '/api/v1/announcements/a1/seen',
      '/api/v1/announcements/seen',
    ])
  })
})
