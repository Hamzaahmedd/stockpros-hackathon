import {
  AnnouncementPlacement,
  AnnouncementPlanTarget,
  AnnouncementSeverity,
  AnnouncementStatus,
} from '@/modules/announcements'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminAnnouncement, AdminPage } from '../types'

const service = vi.hoisted(() => ({
  listAnnouncements: vi.fn(),
  getAnnouncement: vi.fn(),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  publishAnnouncement: vi.fn(),
  disableAnnouncement: vi.fn(),
  enableAnnouncement: vi.fn(),
  reannounceAnnouncement: vi.fn(),
  archiveAnnouncement: vi.fn(),
  requestStepUp: vi.fn(),
  verifyStepUp: vi.fn(),
}))
vi.mock('../services', () => ({ adminService: service }))
vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'react-toastify'
import { AnnouncementsTab } from './AnnouncementsTab'

const REASON = 'Launching the forecast panel'

const make = (
  overrides: Partial<AdminAnnouncement> = {},
): AdminAnnouncement => ({
  id: 'a1',
  title: 'Forecast panel',
  body: 'Faster signals',
  ctaLabel: null,
  ctaUrl: null,
  imageUrl: null,
  placement: AnnouncementPlacement.MODAL,
  severity: null,
  anchor: null,
  navKey: null,
  priority: 0,
  dismissible: true,
  inChangelog: true,
  targetPlans: [AnnouncementPlanTarget.ALL],
  targetRoles: [],
  startsAt: null,
  endsAt: null,
  publishedAt: null,
  status: AnnouncementStatus.DRAFT,
  isEnabled: true,
  version: 2,
  reannounceEpoch: 1,
  createdAt: '2026-10-07T00:00:00.000Z',
  updatedAt: '2026-10-07T00:00:00.000Z',
  ...overrides,
})

const page = (items: AdminAnnouncement[]): AdminPage<AdminAnnouncement> => ({
  items,
  total: items.length,
  page: 1,
  limit: 25,
})

/** Fills the reason and presses the confirm button inside the open dialog (row buttons share its name). */
const confirmWithReason = async (button: RegExp | string) => {
  const dialog = within(screen.getByRole('dialog'))
  await userEvent.type(dialog.getByLabelText(/Reason/), REASON)
  await userEvent.click(dialog.getByRole('button', { name: button }))
}

beforeEach(() => {
  vi.clearAllMocks()
  service.listAnnouncements.mockResolvedValue(page([make()]))
  for (const method of [
    'createAnnouncement',
    'updateAnnouncement',
    'publishAnnouncement',
    'disableAnnouncement',
    'enableAnnouncement',
    'reannounceAnnouncement',
    'archiveAnnouncement',
  ] as const) {
    service[method].mockResolvedValue(undefined)
  }
})

describe('listing', () => {
  it('shows each announcement with its placement, state, audience and schedule', async () => {
    service.listAnnouncements.mockResolvedValue(
      page([
        make({
          title: 'Live banner',
          placement: AnnouncementPlacement.BANNER,
          severity: AnnouncementSeverity.WARNING,
          status: AnnouncementStatus.PUBLISHED,
          isEnabled: false,
          targetPlans: [AnnouncementPlanTarget.PRO],
          endsAt: '2026-10-09T09:30:00.000Z',
        }),
      ]),
    )
    render(<AnnouncementsTab role='PLATFORM_ADMIN' />)

    expect(await screen.findByText('Live banner')).toBeInTheDocument()
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Banner (sticky top notice)')).toBeInTheDocument()
    expect(table.getByText('Published')).toBeInTheDocument()
    expect(table.getByText('Switched off')).toBeInTheDocument()
    expect(table.getByText('PRO')).toBeInTheDocument()
    expect(screen.queryByText('Always')).toBeNull()
  })

  it('says so when there are none, and when loading fails', async () => {
    service.listAnnouncements.mockResolvedValue(page([]))
    const { unmount } = render(<AnnouncementsTab role='PLATFORM_ADMIN' />)
    expect(await screen.findByText('No announcements yet.')).toBeInTheDocument()
    unmount()

    service.listAnnouncements.mockRejectedValue(new Error('boom'))
    render(<AnnouncementsTab role='PLATFORM_ADMIN' />)
    expect(await screen.findByText('No announcements yet.')).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalled()
  })

  it('refetches from the first page when a filter changes', async () => {
    render(<AnnouncementsTab role='PLATFORM_ADMIN' />)
    await screen.findByText('Forecast panel')

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'PUBLISHED')
    await waitFor(() =>
      expect(service.listAnnouncements).toHaveBeenLastCalledWith(
        { status: 'PUBLISHED', placement: undefined },
        1,
      ),
    )

    await userEvent.selectOptions(screen.getByLabelText('Placement'), 'BANNER')
    await waitFor(() =>
      expect(service.listAnnouncements).toHaveBeenLastCalledWith(
        { status: 'PUBLISHED', placement: 'BANNER' },
        1,
      ),
    )
  })
})

describe('what each role sees', () => {
  it('lets a platform admin create and manage', async () => {
    render(<AnnouncementsTab role='PLATFORM_ADMIN' />)
    await screen.findByText('Forecast panel')

    expect(
      screen.getByRole('button', { name: 'New announcement' }),
    ).toBeInTheDocument()
    for (const name of ['Edit', 'Publish', 'Archive', 'Engagement']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('gives support staff only the emergency switch-off', async () => {
    service.listAnnouncements.mockResolvedValue(
      page([make({ status: AnnouncementStatus.PUBLISHED })]),
    )
    render(<AnnouncementsTab role='SUPPORT_AGENT' />)
    await screen.findByText('Forecast panel')

    expect(
      screen.queryByRole('button', { name: 'New announcement' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Switch off' }),
    ).toBeInTheDocument()
    for (const name of ['Edit', 'Publish', 'Archive', 'Re-announce']) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
  })
})

describe('creating', () => {
  it('keeps the button disabled until the draft is valid, then saves it with a reason', async () => {
    render(<AnnouncementsTab role='PLATFORM_ADMIN' />)
    await screen.findByText('Forecast panel')

    await userEvent.click(
      screen.getByRole('button', { name: 'New announcement' }),
    )
    const create = screen.getByRole('button', { name: 'Create draft' })
    expect(create).toBeDisabled()
    expect(screen.getByLabelText('Problems to fix')).toHaveTextContent(
      'Title is required.',
    )

    await userEvent.type(screen.getByLabelText('Title'), 'Hello')
    await userEvent.type(screen.getByLabelText('Message'), 'World')
    expect(screen.queryByLabelText('Problems to fix')).toBeNull()
    expect(screen.getByRole('figure', { name: 'Preview' })).toHaveTextContent(
      'Hello',
    )

    await confirmWithReason('Create draft')

    await waitFor(() =>
      expect(service.createAnnouncement).toHaveBeenCalledTimes(1),
    )
    const [payload, reason, ticket] = service.createAnnouncement.mock.calls[0]
    expect(payload).toMatchObject({
      title: 'Hello',
      body: 'World',
      placement: 'MODAL',
      targetPlans: ['ALL'],
    })
    expect(reason).toBe(REASON)
    expect(ticket).toBeUndefined()
    // The list is reloaded after a save.
    await waitFor(() =>
      expect(service.listAnnouncements).toHaveBeenCalledTimes(2),
    )
  })

  it('shows only the control the chosen placement needs', async () => {
    render(<AnnouncementsTab role='PLATFORM_ADMIN' />)
    await screen.findByText('Forecast panel')
    await userEvent.click(
      screen.getByRole('button', { name: 'New announcement' }),
    )

    expect(screen.queryByLabelText('Severity')).toBeNull()
    await userEvent.selectOptions(
      screen.getByLabelText('Where it appears'),
      'BANNER',
    )
    expect(screen.getByLabelText('Severity')).toBeInTheDocument()
    await userEvent.selectOptions(
      screen.getByLabelText('Where it appears'),
      'SPOTLIGHT',
    )
    expect(screen.getByLabelText('Points at')).toBeInTheDocument()
    await userEvent.selectOptions(
      screen.getByLabelText('Where it appears'),
      'BADGE',
    )
    expect(screen.getByLabelText('Menu entry')).toBeInTheDocument()
  })

  it('keeps a modal dismissible even after a banner was set to stay', async () => {
    render(<AnnouncementsTab role='PLATFORM_ADMIN' />)
    await screen.findByText('Forecast panel')
    await userEvent.click(
      screen.getByRole('button', { name: 'New announcement' }),
    )

    const dismissible = screen.getByLabelText('Users can dismiss it')
    await userEvent.selectOptions(
      screen.getByLabelText('Where it appears'),
      'BANNER',
    )
    await userEvent.click(dismissible)
    expect(dismissible).not.toBeChecked()

    await userEvent.selectOptions(
      screen.getByLabelText('Where it appears'),
      'MODAL',
    )
    expect(dismissible).toBeChecked()
    expect(dismissible).toBeDisabled()
  })

  it('picks plans and roles', async () => {
    render(<AnnouncementsTab role='PLATFORM_ADMIN' />)
    await screen.findByText('Forecast panel')
    await userEvent.click(
      screen.getByRole('button', { name: 'New announcement' }),
    )

    await userEvent.click(screen.getByLabelText('Pro'))
    expect(screen.getByLabelText('All plans')).not.toBeChecked()
    expect(screen.getByLabelText('Pro')).toBeChecked()
    await userEvent.click(screen.getByLabelText('ADMIN'))
    expect(screen.getByLabelText('ADMIN')).toBeChecked()
  })

  it('reports an API refusal instead of closing', async () => {
    service.createAnnouncement.mockRejectedValue({
      response: { data: { message: 'endsAt must be after startsAt' } },
    })
    render(<AnnouncementsTab role='PLATFORM_ADMIN' />)
    await screen.findByText('Forecast panel')
    await userEvent.click(
      screen.getByRole('button', { name: 'New announcement' }),
    )
    await userEvent.type(screen.getByLabelText('Title'), 'Hello')
    await userEvent.type(screen.getByLabelText('Message'), 'World')
    await confirmWithReason('Create draft')

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(
      screen.getByRole('button', { name: 'Create draft' }),
    ).toBeInTheDocument()
  })
})

describe('editing', () => {
  it('sends the version the editor saw, so a stale edit is refused by the API', async () => {
    service.listAnnouncements.mockResolvedValue(
      page([make({ version: 7, title: 'Old title' })]),
    )
    render(<AnnouncementsTab role='PLATFORM_ADMIN' />)
    await screen.findByText('Old title')

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const title = screen.getByLabelText('Title')
    await userEvent.clear(title)
    await userEvent.type(title, 'New title')
    await confirmWithReason('Save changes')

    await waitFor(() =>
      expect(service.updateAnnouncement).toHaveBeenCalledTimes(1),
    )
    const [id, payload, expectedVersion, reason] =
      service.updateAnnouncement.mock.calls[0]
    expect(id).toBe('a1')
    expect(payload.title).toBe('New title')
    expect(expectedVersion).toBe(7)
    expect(reason).toBe(REASON)
  })
})

describe('lifecycle actions', () => {
  const published = make({ status: AnnouncementStatus.PUBLISHED })

  it('publishes a draft after a reason', async () => {
    render(<AnnouncementsTab role='PLATFORM_ADMIN' />)
    await screen.findByText('Forecast panel')

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await confirmWithReason(/^Publish$/)

    await waitFor(() =>
      expect(service.publishAnnouncement).toHaveBeenCalledWith(
        'a1',
        REASON,
        undefined,
      ),
    )
  })

  it('switches a live announcement off, as support staff', async () => {
    service.listAnnouncements.mockResolvedValue(page([published]))
    render(<AnnouncementsTab role='SUPPORT_AGENT' />)
    await screen.findByText('Forecast panel')

    await userEvent.click(screen.getByRole('button', { name: 'Switch off' }))
    expect(screen.getByText(/Emergency kill switch/)).toBeInTheDocument()
    await confirmWithReason(/^Switch off$/)

    await waitFor(() =>
      expect(service.disableAnnouncement).toHaveBeenCalledWith(
        'a1',
        REASON,
        undefined,
      ),
    )
  })

  it.each([
    [
      'Switch on',
      'enableAnnouncement',
      make({ status: AnnouncementStatus.PUBLISHED, isEnabled: false }),
    ],
    ['Re-announce', 'reannounceAnnouncement', published],
    ['Archive', 'archiveAnnouncement', published],
  ] as const)('%s runs after a reason', async (label, method, record) => {
    service.listAnnouncements.mockResolvedValue(page([record]))
    render(<AnnouncementsTab role='PLATFORM_ADMIN' />)
    await screen.findByText('Forecast panel')

    await userEvent.click(screen.getByRole('button', { name: label }))
    await confirmWithReason(new RegExp(`^${label}$`))

    await waitFor(() =>
      expect(service[method]).toHaveBeenCalledWith('a1', REASON, undefined),
    )
  })

  it('can be cancelled without calling the API', async () => {
    render(<AnnouncementsTab role='PLATFORM_ADMIN' />)
    await screen.findByText('Forecast panel')

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(service.publishAnnouncement).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(/Reason/)).toBeNull()
  })
})

describe('engagement', () => {
  it('shows how many people have seen and dismissed it', async () => {
    service.getAnnouncement.mockResolvedValue({
      ...make({ reannounceEpoch: 3 }),
      engagement: { seen: 120, dismissed: 45 },
    })
    render(<AnnouncementsTab role='SUPPORT_AGENT' />)
    await screen.findByText('Forecast panel')

    await userEvent.click(screen.getByRole('button', { name: 'Engagement' }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('120')).toBeInTheDocument()
    expect(within(dialog).getByText('45')).toBeInTheDocument()
    expect(service.getAnnouncement).toHaveBeenCalledWith('a1')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reports a failure to load it', async () => {
    service.getAnnouncement.mockRejectedValue(new Error('boom'))
    render(<AnnouncementsTab role='SUPPORT_AGENT' />)
    await screen.findByText('Forecast panel')

    await userEvent.click(screen.getByRole('button', { name: 'Engagement' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })
})
