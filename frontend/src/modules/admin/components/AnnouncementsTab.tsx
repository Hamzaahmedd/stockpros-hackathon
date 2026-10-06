import {
  AnnouncementPlacement,
  AnnouncementStatus,
} from '@/modules/announcements'
import type { PlatformRole } from '@/modules/auth/types'
import { Modal } from '@/shared/components/Modal'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import {
  AnnouncementRowAction,
  availableActions,
} from '../announcement-actions'
import { audienceSummary } from '../announcement-form'
import { PLACEMENT_LABELS, STATUS_LABELS } from '../announcement-labels'
import { adminService } from '../services'
import type {
  AdminAnnouncement,
  AdminAnnouncementDetail,
  AdminPage,
  AnnouncementFilters,
} from '../types'
import { apiErrorMessage, formatDateTime, hasPlatformRole } from '../utils'
import { AnnouncementEditorModal } from './AnnouncementEditorModal'
import { Pager } from './Pager'
import { ReasonModal } from './ReasonModal'

const ACTION_LABELS: Readonly<Record<AnnouncementRowAction, string>> = {
  [AnnouncementRowAction.STATS]: 'Engagement',
  [AnnouncementRowAction.EDIT]: 'Edit',
  [AnnouncementRowAction.PUBLISH]: 'Publish',
  [AnnouncementRowAction.DISABLE]: 'Switch off',
  [AnnouncementRowAction.ENABLE]: 'Switch on',
  [AnnouncementRowAction.REANNOUNCE]: 'Re-announce',
  [AnnouncementRowAction.ARCHIVE]: 'Archive',
}

interface ConfirmCopy {
  title: string
  description: string
  confirmLabel: string
  successMessage: string
  destructive?: boolean
  run: (id: string, reason: string, ticketRef?: string) => Promise<void>
}

/** The reason-gated lifecycle actions (everything except edit and engagement). */
const CONFIRMS: Readonly<Partial<Record<AnnouncementRowAction, ConfirmCopy>>> =
  {
    [AnnouncementRowAction.PUBLISH]: {
      title: 'Publish announcement',
      description:
        'It goes live for its audience right away (or at its start time).',
      confirmLabel: 'Publish',
      successMessage: 'Announcement published',
      run: adminService.publishAnnouncement,
    },
    [AnnouncementRowAction.DISABLE]: {
      title: 'Switch announcement off',
      description:
        'Emergency kill switch: it disappears for everyone straight away. Connected users update immediately; others within a few seconds.',
      confirmLabel: 'Switch off',
      successMessage: 'Announcement switched off',
      destructive: true,
      run: adminService.disableAnnouncement,
    },
    [AnnouncementRowAction.ENABLE]: {
      title: 'Switch announcement on',
      description: 'It shows again for its audience. Dismissals are kept.',
      confirmLabel: 'Switch on',
      successMessage: 'Announcement switched on',
      run: adminService.enableAnnouncement,
    },
    [AnnouncementRowAction.REANNOUNCE]: {
      title: 'Re-announce',
      description:
        'Resets every user’s dismissal and read state, so everyone in the audience sees it again. Use sparingly.',
      confirmLabel: 'Re-announce',
      successMessage: 'Announcement re-announced',
      destructive: true,
      run: adminService.reannounceAnnouncement,
    },
    [AnnouncementRowAction.ARCHIVE]: {
      title: 'Archive announcement',
      description:
        'It is hidden for good and cannot be edited or published again. The audit trail is kept.',
      confirmLabel: 'Archive',
      successMessage: 'Announcement archived',
      destructive: true,
      run: adminService.archiveAnnouncement,
    },
  }

type Pending =
  | { action: AnnouncementRowAction; announcement: AdminAnnouncement }
  | { action: 'create' }

function StatsModal({
  announcement,
  onClose,
}: Readonly<{ announcement: AdminAnnouncement; onClose: () => void }>) {
  const [detail, setDetail] = useState<AdminAnnouncementDetail | null>(null)

  useEffect(() => {
    let cancelled = false
    adminService
      .getAnnouncement(announcement.id)
      .then((result) => {
        if (!cancelled) setDetail(result)
      })
      .catch((err) =>
        toast.error(apiErrorMessage(err, 'Failed to load engagement')),
      )
    return () => {
      cancelled = true
    }
  }, [announcement.id])

  return (
    <Modal isOpen onClose={onClose} title={announcement.title}>
      {detail ? (
        <dl className='grid grid-cols-2 gap-3 text-sm'>
          <dt className='text-muted-foreground'>Seen</dt>
          <dd className='font-medium'>{detail.engagement.seen}</dd>
          <dt className='text-muted-foreground'>Dismissed</dt>
          <dd className='font-medium'>{detail.engagement.dismissed}</dd>
          <dt className='text-muted-foreground'>Re-announce round</dt>
          <dd className='font-medium'>{detail.reannounceEpoch}</dd>
          <dt className='text-muted-foreground'>Version</dt>
          <dd className='font-medium'>{detail.version}</dd>
          <dt className='text-muted-foreground'>Last changed</dt>
          <dd className='font-medium'>{formatDateTime(detail.updatedAt)}</dd>
        </dl>
      ) : (
        <p className='text-sm text-muted-foreground'>Loading…</p>
      )}
      <p className='mt-4 text-xs text-muted-foreground'>
        Counts are for the current re-announce round only.
      </p>
      <div className='mt-4 flex justify-end'>
        <Button variant='ghost' onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}

const schedule = (announcement: AdminAnnouncement): string => {
  if (!announcement.startsAt && !announcement.endsAt) return 'Always'
  return `${formatDateTime(announcement.startsAt)} → ${formatDateTime(announcement.endsAt)}`
}

/** Create, schedule, publish and (emergency) switch off the in-app announcements. */
export function AnnouncementsTab({ role }: Readonly<{ role: PlatformRole }>) {
  const [status, setStatus] = useState<AnnouncementStatus | ''>('')
  const [placement, setPlacement] = useState<AnnouncementPlacement | ''>('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<AdminPage<AdminAnnouncement> | null>(
    null,
  )
  const [pending, setPending] = useState<Pending | null>(null)
  const canCreate = hasPlatformRole(role, 'PLATFORM_ADMIN')

  const load = useCallback(async () => {
    const filters: AnnouncementFilters = {
      status: status || undefined,
      placement: placement || undefined,
    }
    try {
      setResult(await adminService.listAnnouncements(filters, page))
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to load announcements'))
      setResult(
        (current) => current ?? { items: [], total: 0, page: 1, limit: 25 },
      )
    }
  }, [status, placement, page])

  useEffect(() => {
    void load()
  }, [load])

  const close = () => setPending(null)
  const confirm =
    pending && pending.action !== 'create' ? CONFIRMS[pending.action] : null

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <select
          aria-label='Status'
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as AnnouncementStatus | '')
            setPage(1)
          }}
          className='h-9 rounded-md border border-input bg-background px-3 text-sm'
        >
          <option value=''>All statuses</option>
          {Object.values(AnnouncementStatus).map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          aria-label='Placement'
          value={placement}
          onChange={(event) => {
            setPlacement(event.target.value as AnnouncementPlacement | '')
            setPage(1)
          }}
          className='h-9 rounded-md border border-input bg-background px-3 text-sm'
        >
          <option value=''>All placements</option>
          {Object.values(AnnouncementPlacement).map((value) => (
            <option key={value} value={value}>
              {PLACEMENT_LABELS[value]}
            </option>
          ))}
        </select>
        {canCreate && (
          <Button
            className='ml-auto'
            onClick={() => setPending({ action: 'create' })}
          >
            New announcement
          </Button>
        )}
      </div>

      {result === null ? (
        <p className='text-sm text-muted-foreground'>Loading…</p>
      ) : result.items.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No announcements yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Announcement</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Audience</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <p className='font-medium'>{item.title}</p>
                  <p className='text-xs text-muted-foreground'>
                    {PLACEMENT_LABELS[item.placement]}
                  </p>
                </TableCell>
                <TableCell>
                  <div className='flex flex-wrap gap-1'>
                    <Badge variant='secondary'>
                      {STATUS_LABELS[item.status]}
                    </Badge>
                    {item.status === AnnouncementStatus.PUBLISHED &&
                      !item.isEnabled && (
                        <Badge variant='destructive'>Switched off</Badge>
                      )}
                  </div>
                </TableCell>
                <TableCell className='text-sm'>
                  {audienceSummary(item.targetPlans, item.targetRoles)}
                </TableCell>
                <TableCell className='text-sm'>{schedule(item)}</TableCell>
                <TableCell>
                  <div className='flex flex-wrap gap-1'>
                    {availableActions(item, role).map((action) => (
                      <Button
                        key={action}
                        size='sm'
                        variant={
                          action === AnnouncementRowAction.DISABLE
                            ? 'destructive'
                            : 'ghost'
                        }
                        onClick={() =>
                          setPending({ action, announcement: item })
                        }
                      >
                        {ACTION_LABELS[action]}
                      </Button>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {result && <Pager result={result} onPage={setPage} />}

      {pending?.action === 'create' && (
        <AnnouncementEditorModal onClose={close} onDone={() => void load()} />
      )}
      {pending?.action === AnnouncementRowAction.EDIT && (
        <AnnouncementEditorModal
          announcement={pending.announcement}
          onClose={close}
          onDone={() => void load()}
        />
      )}
      {pending?.action === AnnouncementRowAction.STATS && (
        <StatsModal announcement={pending.announcement} onClose={close} />
      )}
      {pending && pending.action !== 'create' && confirm && (
        <ReasonModal
          title={confirm.title}
          description={`${pending.announcement.title}. ${confirm.description}`}
          confirmLabel={confirm.confirmLabel}
          successMessage={confirm.successMessage}
          destructive={confirm.destructive}
          onSubmit={(reason, ticketRef) =>
            confirm.run(pending.announcement.id, reason, ticketRef)
          }
          onClose={close}
          onDone={() => void load()}
        />
      )}
    </div>
  )
}
