import {
  AnnouncementPlacement,
  AnnouncementPlanTarget,
  AnnouncementStatus,
} from '@/modules/announcements'

export const PLACEMENT_LABELS: Readonly<Record<AnnouncementPlacement, string>> =
  {
    [AnnouncementPlacement.MODAL]: "Modal (What's new overlay)",
    [AnnouncementPlacement.SPOTLIGHT]: 'Spotlight (callout on a control)',
    [AnnouncementPlacement.BANNER]: 'Banner (sticky top notice)',
    [AnnouncementPlacement.BADGE]: 'Badge (menu indicator)',
    [AnnouncementPlacement.CHANGELOG]: 'Changelog only (bell drawer)',
  }

export const PLAN_LABELS: Readonly<Record<AnnouncementPlanTarget, string>> = {
  [AnnouncementPlanTarget.ALL]: 'All plans',
  [AnnouncementPlanTarget.FREE]: 'Free',
  [AnnouncementPlanTarget.PRO]: 'Pro',
  [AnnouncementPlanTarget.TEAM]: 'Team',
}

export const STATUS_LABELS: Readonly<Record<AnnouncementStatus, string>> = {
  [AnnouncementStatus.DRAFT]: 'Draft',
  [AnnouncementStatus.PUBLISHED]: 'Published',
  [AnnouncementStatus.ARCHIVED]: 'Archived',
}
