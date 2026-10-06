import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FeedbackCategory,
  FeedbackStatus,
  type FeedbackListResult,
  type FeedbackListRow,
} from '../types'

const service = vi.hoisted(() => ({ list: vi.fn(), setStatus: vi.fn() }))
vi.mock('../services', () => ({ feedbackService: service }))
vi.mock('@/shared/components/Sidebar', () => ({ Sidebar: () => null }))
vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'react-toastify'
import FeedbackList from './FeedbackList'

let counter = 0
const row = (overrides: Partial<FeedbackListRow> = {}): FeedbackListRow => {
  counter += 1
  return {
    id: `f${counter}`,
    message: `Message ${counter}`,
    page: '/forecast',
    category: null,
    status: FeedbackStatus.NEW,
    metadata: null,
    statusUpdatedAt: null,
    createdAt: '2026-10-07T12:00:00.000Z',
    user: { id: 'u1', displayName: 'Sam Lee', email: 'sam@fund.com' },
    ...overrides,
  }
}

const page = (
  data: FeedbackListRow[],
  overrides: Partial<FeedbackListResult> = {},
): FeedbackListResult => ({
  data,
  nextCursor: null,
  hasMore: false,
  total: data.length,
  counts: { NEW: 3, READ: 2, ARCHIVED: 1 },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  service.list.mockResolvedValue(page([row({ message: 'Chart is blank' })]))
  service.setStatus.mockResolvedValue(undefined)
})

describe('status tabs', () => {
  it('opens on New with the whole inbox counted in the tabs', async () => {
    render(<FeedbackList />)

    expect(await screen.findByText('Chart is blank')).toBeInTheDocument()
    expect(service.list).toHaveBeenCalledWith({ status: FeedbackStatus.NEW })

    const tabs = within(screen.getByRole('tablist'))
    expect(tabs.getByRole('tab', { name: /^New/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(tabs.getByRole('tab', { name: /New\s*3/ })).toBeInTheDocument()
    expect(tabs.getByRole('tab', { name: /Read\s*2/ })).toBeInTheDocument()
    expect(tabs.getByRole('tab', { name: /Archived\s*1/ })).toBeInTheDocument()
    expect(tabs.getByRole('tab', { name: /All\s*6/ })).toBeInTheDocument()
  })

  it('refetches for the chosen status, and for all', async () => {
    render(<FeedbackList />)
    await screen.findByText('Chart is blank')

    await userEvent.click(screen.getByRole('tab', { name: /Archived/ }))
    await waitFor(() =>
      expect(service.list).toHaveBeenLastCalledWith({
        status: FeedbackStatus.ARCHIVED,
      }),
    )

    await userEvent.click(screen.getByRole('tab', { name: /All/ }))
    await waitFor(() =>
      expect(service.list).toHaveBeenLastCalledWith({ status: undefined }),
    )
  })

  it('says so when a tab is empty', async () => {
    service.list.mockResolvedValue(page([], { total: 0 }))
    render(<FeedbackList />)
    expect(
      await screen.findByText('Nothing new. You are all caught up.'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /Read/ }))
    expect(await screen.findByText('No read feedback.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /Archived/ }))
    expect(await screen.findByText('No archived feedback.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /All/ }))
    expect(
      await screen.findByText('No feedback submitted yet.'),
    ).toBeInTheDocument()
  })

  it('shows each entry’s state on the All tab only', async () => {
    service.list.mockResolvedValue(
      page([row({ status: FeedbackStatus.READ, message: 'Seen already' })]),
    )
    render(<FeedbackList />)
    await screen.findByText('Seen already')
    expect(screen.queryByText('READ')).toBeNull()

    await userEvent.click(screen.getByRole('tab', { name: /All/ }))
    expect(await screen.findByText('READ')).toBeInTheDocument()
  })
})

describe('rows', () => {
  it('shows who sent it, the category and the page', async () => {
    service.list.mockResolvedValue(
      page([row({ category: FeedbackCategory.FEATURE_REQUEST })]),
    )
    render(<FeedbackList />)

    expect(await screen.findByText('Sam Lee')).toBeInTheDocument()
    expect(screen.getByText('sam@fund.com')).toBeInTheDocument()
    expect(screen.getByText('Feature request')).toBeInTheDocument()
    expect(screen.getByText('/forecast')).toBeInTheDocument()
  })

  it('shows a dash for an entry with no page and no category chip', async () => {
    service.list.mockResolvedValue(page([row({ page: null })]))
    render(<FeedbackList />)
    await screen.findByText('Sam Lee')
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('Bug')).toBeNull()
  })

  it('reveals the technical details on demand', async () => {
    service.list.mockResolvedValue(
      page([
        row({
          metadata: {
            planTier: 'PRO',
            userAgent: 'Mozilla/5.0 (Test)',
            viewport: { width: 1440, height: 900 },
            appVersion: '1.2.3',
          },
        }),
      ]),
    )
    render(<FeedbackList />)
    await screen.findByText('Sam Lee')
    expect(screen.queryByText('Mozilla/5.0 (Test)')).toBeNull()

    const toggle = screen.getByRole('button', { name: /Technical details/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('PRO')).toBeInTheDocument()
    expect(screen.getByText('Mozilla/5.0 (Test)')).toBeInTheDocument()
    expect(screen.getByText('1440 × 900')).toBeInTheDocument()
    expect(screen.getByText('1.2.3')).toBeInTheDocument()

    await userEvent.click(toggle)
    expect(screen.queryByText('Mozilla/5.0 (Test)')).toBeNull()
  })

  it('says when nothing technical was sent, and shows a dash for a missing field', async () => {
    service.list.mockResolvedValue(
      page([row(), row({ metadata: { planTier: 'FREE' } })]),
    )
    render(<FeedbackList />)
    await screen.findAllByText('Sam Lee')

    const toggles = screen.getAllByRole('button', { name: /Technical details/ })
    await userEvent.click(toggles[0])
    expect(
      screen.getByText('No technical details were sent with this one.'),
    ).toBeInTheDocument()

    await userEvent.click(toggles[1])
    expect(screen.getByText('FREE')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
  })
})

describe('triage actions', () => {
  it.each([
    [FeedbackStatus.NEW, ['Mark read', 'Archive']],
    [FeedbackStatus.READ, ['Mark unread', 'Archive']],
    [FeedbackStatus.ARCHIVED, ['Restore to New']],
  ])('offers the right moves for a %s entry', async (status, labels) => {
    service.list.mockResolvedValue(page([row({ status })]))
    render(<FeedbackList />)
    await screen.findByText('Sam Lee')

    const shown = screen
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((text) =>
        ['Mark read', 'Mark unread', 'Archive', 'Restore to New'].includes(
          text ?? '',
        ),
      )
    expect(shown).toEqual(labels)
  })

  it('marks an entry read, then reloads the list and the counts', async () => {
    const entry = row({ message: 'Please read me' })
    service.list
      .mockResolvedValueOnce(page([entry]))
      .mockResolvedValueOnce(
        page([], { counts: { NEW: 2, READ: 3, ARCHIVED: 1 } }),
      )
    render(<FeedbackList />)
    await screen.findByText('Please read me')

    await userEvent.click(screen.getByRole('button', { name: 'Mark read' }))

    await waitFor(() =>
      expect(service.setStatus).toHaveBeenCalledWith(
        entry.id,
        FeedbackStatus.READ,
      ),
    )
    await waitFor(() => expect(service.list).toHaveBeenCalledTimes(2))
    expect(
      await screen.findByRole('tab', { name: /New\s*2/ }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Please read me')).toBeNull()
  })

  it.each([
    ['Archive', FeedbackStatus.ARCHIVED, FeedbackStatus.NEW],
    ['Mark unread', FeedbackStatus.NEW, FeedbackStatus.READ],
    ['Restore to New', FeedbackStatus.NEW, FeedbackStatus.ARCHIVED],
  ])('%s sends %s for a %s entry', async (label, to, from) => {
    const entry = row({ status: from })
    service.list.mockResolvedValue(page([entry]))
    render(<FeedbackList />)
    await screen.findByText('Sam Lee')

    await userEvent.click(screen.getByRole('button', { name: label }))
    await waitFor(() =>
      expect(service.setStatus).toHaveBeenCalledWith(entry.id, to),
    )
  })

  it('reports a failed change and keeps the entry', async () => {
    service.setStatus.mockRejectedValue(new Error('403'))
    render(<FeedbackList />)
    await screen.findByText('Chart is blank')

    await userEvent.click(screen.getByRole('button', { name: 'Mark read' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Could not update this feedback',
      ),
    )
    expect(screen.getByText('Chart is blank')).toBeInTheDocument()
    expect(service.list).toHaveBeenCalledTimes(1)
  })
})

describe('paging and errors', () => {
  it('loads more of the same view with the cursor and the status', async () => {
    service.list
      .mockResolvedValueOnce(
        page([row({ message: 'First' })], { hasMore: true, nextCursor: 'c1' }),
      )
      .mockResolvedValueOnce(page([row({ message: 'Second' })]))
    render(<FeedbackList />)
    await screen.findByText('First')

    await userEvent.click(screen.getByRole('button', { name: 'Load More' }))

    expect(await screen.findByText('Second')).toBeInTheDocument()
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(service.list).toHaveBeenLastCalledWith({
      cursor: 'c1',
      status: FeedbackStatus.NEW,
    })
    expect(screen.queryByRole('button', { name: 'Load More' })).toBeNull()
  })

  it('does nothing when there is no cursor, and reports a failed page', async () => {
    service.list
      .mockResolvedValueOnce(
        page([row({ message: 'First' })], { hasMore: true, nextCursor: 'c1' }),
      )
      .mockRejectedValueOnce(new Error('offline'))
    render(<FeedbackList />)
    await screen.findByText('First')

    await userEvent.click(screen.getByRole('button', { name: 'Load More' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to load more feedback'),
    )
    expect(screen.getByText('First')).toBeInTheDocument()
  })

  it('reports a failed first load', async () => {
    service.list.mockRejectedValue(new Error('offline'))
    render(<FeedbackList />)
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to load feedback'),
    )
  })

  it('pluralises the heading', async () => {
    service.list.mockResolvedValue(page([row()], { total: 1 }))
    const { unmount } = render(<FeedbackList />)
    expect(
      await screen.findByText('1 submission in this view'),
    ).toBeInTheDocument()
    unmount()

    service.list.mockResolvedValue(page([row(), row()], { total: 2 }))
    render(<FeedbackList />)
    expect(
      await screen.findByText('2 submissions in this view'),
    ).toBeInTheDocument()
  })
})
