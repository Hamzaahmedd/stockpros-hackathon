import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnnouncementPayload } from './announcement-form'

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))
vi.mock('@/shared/api/axios', () => ({ default: api }))

import { adminService } from './services'

const BASE = '/api/v1/admin/announcements'
const REASON = 'Launching the forecast panel'
const PAYLOAD = { title: 'T' } as AnnouncementPayload

beforeEach(() => {
  vi.clearAllMocks()
  for (const method of ['post', 'patch', 'delete'] as const) {
    api[method].mockResolvedValue({ data: { success: true } })
  }
})

describe('adminService announcements', () => {
  it('lists with compact filters and the page', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: { items: [] } } })
    await adminService.listAnnouncements(
      { status: undefined, placement: 'BANNER' as never },
      2,
    )
    expect(api.get).toHaveBeenCalledWith(BASE, {
      params: { placement: 'BANNER', page: 2 },
    })
  })

  it('reads one announcement', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: { id: 'a1' } } })
    await expect(adminService.getAnnouncement('a1')).resolves.toEqual({
      id: 'a1',
    })
    expect(api.get).toHaveBeenCalledWith(`${BASE}/a1`)
  })

  it('creates with the content, reason and ticket in one body', async () => {
    await adminService.createAnnouncement(PAYLOAD, REASON, 'SUP-1')
    expect(api.post).toHaveBeenCalledWith(BASE, {
      title: 'T',
      reason: REASON,
      ticketRef: 'SUP-1',
    })
  })

  it('updates with the version the editor saw', async () => {
    await adminService.updateAnnouncement('a1', PAYLOAD, 7, REASON)
    expect(api.patch).toHaveBeenCalledWith(`${BASE}/a1`, {
      title: 'T',
      expectedVersion: 7,
      reason: REASON,
      ticketRef: undefined,
    })
  })

  it.each([
    ['publishAnnouncement', 'publish'],
    ['disableAnnouncement', 'disable'],
    ['enableAnnouncement', 'enable'],
    ['reannounceAnnouncement', 'reannounce'],
  ] as const)('%s posts to /%s with a reason', async (method, path) => {
    await adminService[method]('a1', REASON, 'SUP-2')
    expect(api.post).toHaveBeenCalledWith(`${BASE}/a1/${path}`, {
      reason: REASON,
      ticketRef: 'SUP-2',
    })
  })

  it('archives with the reason in the request body', async () => {
    await adminService.archiveAnnouncement('a1', REASON)
    expect(api.delete).toHaveBeenCalledWith(`${BASE}/a1`, {
      data: { reason: REASON, ticketRef: undefined },
    })
  })
})
