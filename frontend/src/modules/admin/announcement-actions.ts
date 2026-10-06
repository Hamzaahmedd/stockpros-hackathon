import { AnnouncementStatus } from '@/modules/announcements'
import type { PlatformRole } from '@/modules/auth/types'
import type { AdminAnnouncement } from './types'
import { hasPlatformRole } from './utils'

export enum AnnouncementRowAction {
  STATS = 'STATS',
  EDIT = 'EDIT',
  PUBLISH = 'PUBLISH',
  DISABLE = 'DISABLE',
  ENABLE = 'ENABLE',
  REANNOUNCE = 'REANNOUNCE',
  ARCHIVE = 'ARCHIVE',
}

/**
 * What this staff member may do to this announcement. Mirrors the API (which
 * enforces every rule): the emergency switch-off is open to support staff,
 * everything else needs a platform admin.
 */
export const availableActions = (
  announcement: Pick<AdminAnnouncement, 'status' | 'isEnabled'>,
  role: PlatformRole | undefined,
): AnnouncementRowAction[] => {
  const admin = hasPlatformRole(role, 'PLATFORM_ADMIN')
  const support = hasPlatformRole(role, 'SUPPORT_AGENT')
  const { status, isEnabled } = announcement
  const published = status === AnnouncementStatus.PUBLISHED
  const archived = status === AnnouncementStatus.ARCHIVED

  const actions: AnnouncementRowAction[] = [AnnouncementRowAction.STATS]
  if (admin && !archived) actions.push(AnnouncementRowAction.EDIT)
  if (admin && status === AnnouncementStatus.DRAFT) {
    actions.push(AnnouncementRowAction.PUBLISH)
  }
  if (support && published && isEnabled) {
    actions.push(AnnouncementRowAction.DISABLE)
  }
  if (admin && published && !isEnabled) {
    actions.push(AnnouncementRowAction.ENABLE)
  }
  if (admin && published) actions.push(AnnouncementRowAction.REANNOUNCE)
  if (admin && !archived) actions.push(AnnouncementRowAction.ARCHIVE)
  return actions
}
