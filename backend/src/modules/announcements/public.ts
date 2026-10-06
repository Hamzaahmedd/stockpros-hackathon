// Public cross-module surface for the announcements module.
export {
  getActiveAnnouncements,
  invalidateActiveAnnouncements,
} from './active-cache'
export { getBootAnnouncements } from './service'
export type {
  AnnouncementBootPayload,
  AnnouncementDto,
  AudienceContext,
} from './types'
// Documentation shape of the /auth/me slice, so the auth spec can reference it.
export type { AnnouncementBoot } from './swagger-types'
