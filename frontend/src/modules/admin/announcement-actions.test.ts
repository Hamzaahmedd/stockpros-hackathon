import { AnnouncementStatus } from '@/modules/announcements'
import type { PlatformRole } from '@/modules/auth/types'
import { describe, expect, it } from 'vitest'
import {
  AnnouncementRowAction as A,
  availableActions,
} from './announcement-actions'

const item = (status: AnnouncementStatus, isEnabled = true) => ({
  status,
  isEnabled,
})

const cases: Array<
  [string, ReturnType<typeof item>, PlatformRole | undefined, A[]]
> = [
  [
    'a USER sees nothing but engagement',
    item(AnnouncementStatus.DRAFT),
    'USER',
    [A.STATS],
  ],
  ['no role', item(AnnouncementStatus.DRAFT), undefined, [A.STATS]],
  [
    'support on a draft',
    item(AnnouncementStatus.DRAFT),
    'SUPPORT_AGENT',
    [A.STATS],
  ],
  [
    'support on a live announcement can only switch it off',
    item(AnnouncementStatus.PUBLISHED),
    'SUPPORT_AGENT',
    [A.STATS, A.DISABLE],
  ],
  [
    'support on a switched-off announcement cannot switch it back on',
    item(AnnouncementStatus.PUBLISHED, false),
    'SUPPORT_AGENT',
    [A.STATS],
  ],
  [
    'an admin on a draft',
    item(AnnouncementStatus.DRAFT),
    'PLATFORM_ADMIN',
    [A.STATS, A.EDIT, A.PUBLISH, A.ARCHIVE],
  ],
  [
    'an admin on a live announcement',
    item(AnnouncementStatus.PUBLISHED),
    'PLATFORM_ADMIN',
    [A.STATS, A.EDIT, A.DISABLE, A.REANNOUNCE, A.ARCHIVE],
  ],
  [
    'an admin on a switched-off announcement',
    item(AnnouncementStatus.PUBLISHED, false),
    'PLATFORM_ADMIN',
    [A.STATS, A.EDIT, A.ENABLE, A.REANNOUNCE, A.ARCHIVE],
  ],
  [
    'an admin on an archived announcement',
    item(AnnouncementStatus.ARCHIVED),
    'PLATFORM_ADMIN',
    [A.STATS],
  ],
  [
    'a super admin has the admin set',
    item(AnnouncementStatus.PUBLISHED),
    'SUPER_ADMIN',
    [A.STATS, A.EDIT, A.DISABLE, A.REANNOUNCE, A.ARCHIVE],
  ],
]

describe('availableActions', () => {
  it.each(cases)('%s', (_label, announcement, role, expected) => {
    expect(availableActions(announcement, role)).toEqual(expected)
  })
})
