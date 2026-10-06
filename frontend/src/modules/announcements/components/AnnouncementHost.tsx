import { useLocation } from 'react-router-dom'
import { useAnnouncements } from '../hooks/useAnnouncements'
import { isAuthFlowPath } from '../utils'
import { AnnouncementBanner } from './AnnouncementBanner'
import { AnnouncementModal } from './AnnouncementModal'
import { AnnouncementSpotlight } from './AnnouncementSpotlight'

/**
 * Mounts the interruptive announcements (modal, spotlight, banner) once for the
 * whole app. Nothing shows while signing in; the server has already chosen at
 * most one of each, so this only renders what it is handed.
 */
export function AnnouncementHost() {
  const { enabled, boot } = useAnnouncements()
  const { pathname } = useLocation()

  if (!enabled || !boot || isAuthFlowPath(pathname)) return null

  return (
    <>
      {boot.banner && <AnnouncementBanner announcement={boot.banner} />}
      {boot.spotlight && (
        <AnnouncementSpotlight announcement={boot.spotlight} />
      )}
      {boot.modal && <AnnouncementModal announcement={boot.modal} />}
    </>
  )
}
