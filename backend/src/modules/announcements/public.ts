// Public cross-module surface for the announcements module.
export {
  getActiveAnnouncements,
  invalidateActiveAnnouncements,
} from './active-cache'
export { getBootPayload } from './service'
export type {
  AnnouncementBootPayload,
  AnnouncementDto,
  AudienceContext,
} from './types'
