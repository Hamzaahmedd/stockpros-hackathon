import { adminService } from '../services'
import {
  EMPTY_DRAFT,
  toDraft,
  toPayload,
  validateDraft,
  type AnnouncementDraft,
} from '../announcement-form'
import type { AdminAnnouncement } from '../types'
import { useState } from 'react'
import { AnnouncementForm } from './AnnouncementForm'
import { AnnouncementPreview } from './AnnouncementPreview'
import { ReasonModal } from './ReasonModal'

interface Props {
  /** The announcement being edited; omit to create a new draft. */
  announcement?: AdminAnnouncement
  onClose: () => void
  onDone: () => void
}

/** Create or edit an announcement. The reason, ticket and step-up check come from the shared confirm dialog. */
export function AnnouncementEditorModal({
  announcement,
  onClose,
  onDone,
}: Readonly<Props>) {
  const [draft, setDraft] = useState<AnnouncementDraft>(
    announcement ? toDraft(announcement) : EMPTY_DRAFT,
  )
  const problems = validateDraft(draft)

  return (
    <ReasonModal
      title={announcement ? 'Edit announcement' : 'New announcement'}
      description={
        announcement
          ? 'Edits go live immediately if it is published. People who dismissed it will not see it again unless you re-announce it.'
          : 'Saved as a draft. Nobody sees it until you publish it.'
      }
      confirmLabel={announcement ? 'Save changes' : 'Create draft'}
      successMessage={announcement ? 'Announcement updated' : 'Draft created'}
      widthClass='max-w-5xl'
      canSubmit={problems.length === 0}
      onSubmit={(reason, ticketRef) =>
        announcement
          ? adminService.updateAnnouncement(
              announcement.id,
              toPayload(draft),
              announcement.version,
              reason,
              ticketRef,
            )
          : adminService.createAnnouncement(toPayload(draft), reason, ticketRef)
      }
      onClose={onClose}
      onDone={onDone}
    >
      <div className='grid gap-6 lg:grid-cols-[3fr_2fr]'>
        <AnnouncementForm draft={draft} onChange={setDraft} />
        <div className='space-y-4'>
          <AnnouncementPreview draft={draft} />
          {problems.length > 0 && (
            <ul
              aria-label='Problems to fix'
              className='list-disc space-y-1 pl-5 text-sm text-destructive'
            >
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ReasonModal>
  )
}
