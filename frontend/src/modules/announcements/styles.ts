import { AnnouncementSeverity } from './types'

/** Banner colours per severity, shared by the live banner and the staff preview. */
export const SEVERITY_STYLES: Readonly<Record<AnnouncementSeverity, string>> = {
  [AnnouncementSeverity.INFO]:
    'border-primary/40 bg-primary text-primary-foreground',
  [AnnouncementSeverity.WARNING]: 'border-amber-500/60 bg-amber-500 text-black',
  [AnnouncementSeverity.CRITICAL]: 'border-red-600 bg-red-600 text-white',
}
