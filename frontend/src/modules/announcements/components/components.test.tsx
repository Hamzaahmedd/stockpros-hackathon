import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnnouncementsContextValue } from '../hooks/useAnnouncements'
import { bootWithChangelog, makeAnnouncement, makeBoot } from '../test-fixtures'
import {
  AnnouncementAnchor,
  AnnouncementNavKey,
  AnnouncementPlacement,
  AnnouncementSeverity,
} from '../types'
import { ANCHOR_ATTRIBUTE } from '../utils'

const ctx = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('../hooks/useAnnouncements', () => ({
  useAnnouncements: () => ctx.current,
}))

import { useNavBadge } from '../hooks/useNavBadge'
import { AnnouncementBanner } from './AnnouncementBanner'
import { AnnouncementCta } from './AnnouncementCta'
import { AnnouncementHost } from './AnnouncementHost'
import { AnnouncementModal } from './AnnouncementModal'
import { AnnouncementSpotlight } from './AnnouncementSpotlight'
import { NavBadgePill } from './NavBadgePill'
import { WhatsNewList } from './WhatsNewList'

const actions = {
  dismiss: vi.fn().mockResolvedValue(undefined),
  markSeen: vi.fn().mockResolvedValue(undefined),
  markAllSeen: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn().mockResolvedValue(undefined),
}

const provide = (
  boot: AnnouncementsContextValue['boot'],
  enabled = true,
): void => {
  ctx.current = { enabled, boot, ...actions }
}

const renderAt = (ui: React.ReactElement, path = '/dashboard') =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  provide(makeBoot())
})

afterEach(() => {
  document
    .querySelectorAll(`[${ANCHOR_ATTRIBUTE}]`)
    .forEach((element) => element.remove())
  document.body.style.paddingTop = ''
})

describe('AnnouncementCta', () => {
  it('routes an in-app path', () => {
    renderAt(<AnnouncementCta label='Go' url='/plans' className='x' />)
    const link = screen.getByRole('link', { name: 'Go' })
    expect(link).toHaveAttribute('href', '/plans')
    expect(link).not.toHaveAttribute('target')
  })

  it('opens an external URL in a new tab without leaking the opener', () => {
    renderAt(
      <AnnouncementCta
        label='Docs'
        url='https://example.com/a'
        className='x'
      />,
    )
    const link = screen.getByRole('link', { name: 'Docs' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('reports a click', async () => {
    const onFollow = vi.fn()
    renderAt(
      <AnnouncementCta
        label='Go'
        url='/plans'
        className='x'
        onFollow={onFollow}
      />,
    )
    await userEvent.click(screen.getByRole('link', { name: 'Go' }))
    expect(onFollow).toHaveBeenCalledTimes(1)
  })
})

describe('AnnouncementModal', () => {
  const modal = makeAnnouncement({
    title: 'Meet the forecast panel',
    body: '<b>not markup</b>',
    ctaLabel: 'Try it',
    ctaUrl: '/forecast',
  })

  it('shows the content as plain text', () => {
    renderAt(<AnnouncementModal announcement={modal} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('<b>not markup</b>')).toBeInTheDocument()
    expect(document.querySelector('b')).toBeNull()
  })

  it('counts as read once shown, but only if it was unread', () => {
    const { unmount } = renderAt(<AnnouncementModal announcement={modal} />)
    expect(actions.markSeen).toHaveBeenCalledWith(modal.id)
    unmount()

    actions.markSeen.mockClear()
    renderAt(<AnnouncementModal announcement={{ ...modal, unread: false }} />)
    expect(actions.markSeen).not.toHaveBeenCalled()
  })

  it('dismisses from the button, the backdrop and Escape', async () => {
    renderAt(<AnnouncementModal announcement={modal} />)

    await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    await userEvent.keyboard('{Escape}')

    expect(actions.dismiss).toHaveBeenCalledTimes(3)
    expect(actions.dismiss).toHaveBeenCalledWith(modal.id)
  })

  it('dismisses when the call to action is followed', async () => {
    renderAt(<AnnouncementModal announcement={modal} />)
    await userEvent.click(screen.getByRole('link', { name: 'Try it' }))
    expect(actions.dismiss).toHaveBeenCalledWith(modal.id)
  })

  it('shows an image when there is one, and no call to action when there is none', () => {
    renderAt(
      <AnnouncementModal
        announcement={{
          ...modal,
          imageUrl: 'https://cdn.example/a.png',
          ctaLabel: null,
          ctaUrl: null,
        }}
      />,
    )
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.example/a.png',
    )
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('AnnouncementBanner', () => {
  const banner = makeAnnouncement({
    placement: AnnouncementPlacement.BANNER,
    severity: AnnouncementSeverity.WARNING,
    title: 'Maintenance tonight',
  })

  it('is a polite status for info and warnings, and an alert when critical', () => {
    const { unmount } = renderAt(<AnnouncementBanner announcement={banner} />)
    expect(screen.getByRole('status')).toHaveTextContent('Maintenance tonight')
    unmount()

    renderAt(
      <AnnouncementBanner
        announcement={{ ...banner, severity: AnnouncementSeverity.CRITICAL }}
      />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('defaults to the info style when no severity came through', () => {
    renderAt(
      <AnnouncementBanner announcement={{ ...banner, severity: null }} />,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('can be dismissed, and removes the page padding it added when it goes', async () => {
    const { unmount } = renderAt(<AnnouncementBanner announcement={banner} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Dismiss announcement' }),
    )
    expect(actions.dismiss).toHaveBeenCalledWith(banner.id)

    document.body.style.paddingTop = '0px'
    unmount()
    expect(document.body.style.paddingTop).toBe('')
  })

  it('has no dismiss button when it cannot be dismissed, and keeps following the link', async () => {
    renderAt(
      <AnnouncementBanner
        announcement={{
          ...banner,
          dismissible: false,
          ctaLabel: 'Status page',
          ctaUrl: 'https://status.example.com',
        }}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'Dismiss announcement' }),
    ).toBeNull()
    await userEvent.click(screen.getByRole('link', { name: 'Status page' }))
    expect(actions.dismiss).not.toHaveBeenCalled()
  })
})

describe('AnnouncementSpotlight', () => {
  const spotlight = makeAnnouncement({
    placement: AnnouncementPlacement.SPOTLIGHT,
    anchor: AnnouncementAnchor.WATCHLIST_ADD,
    title: 'Add your first ticker',
    ctaLabel: 'Open watchlist',
    ctaUrl: '/watchlist',
  })

  const mountAnchor = (anchor: AnnouncementAnchor) => {
    const target = document.createElement('button')
    target.setAttribute(ANCHOR_ATTRIBUTE, anchor)
    target.getBoundingClientRect = () =>
      ({
        x: 100,
        y: 50,
        top: 50,
        left: 100,
        right: 180,
        bottom: 80,
        width: 80,
        height: 30,
      }) as DOMRect
    document.body.appendChild(target)
    return target
  }

  it('shows next to its anchor, and counts as read once visible', () => {
    mountAnchor(AnnouncementAnchor.WATCHLIST_ADD)
    renderAt(<AnnouncementSpotlight announcement={spotlight} />)

    expect(
      screen.getByRole('dialog', { name: 'Add your first ticker' }),
    ).toBeInTheDocument()
    expect(actions.markSeen).toHaveBeenCalledWith(spotlight.id)
  })

  it('renders nothing, and is not dismissed, while its anchor is not on the page', () => {
    renderAt(<AnnouncementSpotlight announcement={spotlight} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(actions.markSeen).not.toHaveBeenCalled()
    expect(actions.dismiss).not.toHaveBeenCalled()
  })

  it('ignores an anchor that is not visible', () => {
    const target = mountAnchor(AnnouncementAnchor.WATCHLIST_ADD)
    target.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
      }) as DOMRect
    renderAt(<AnnouncementSpotlight announcement={spotlight} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders nothing for a spotlight without an anchor', () => {
    renderAt(
      <AnnouncementSpotlight announcement={{ ...spotlight, anchor: null }} />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('appears when the anchor mounts later (a page change) and follows it', async () => {
    vi.useFakeTimers()
    try {
      renderAt(<AnnouncementSpotlight announcement={spotlight} />)
      expect(screen.queryByRole('dialog')).toBeNull()

      const target = mountAnchor(AnnouncementAnchor.WATCHLIST_ADD)
      await act(async () => {
        vi.advanceTimersByTime(800)
      })
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      target.remove()
      await act(async () => {
        vi.advanceTimersByTime(800)
      })
      expect(screen.queryByRole('dialog')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('dismisses from the button, the close icon, Escape and the call to action', async () => {
    mountAnchor(AnnouncementAnchor.WATCHLIST_ADD)
    renderAt(<AnnouncementSpotlight announcement={spotlight} />)

    await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Dismiss announcement' }),
    )
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('link', { name: 'Open watchlist' }))

    expect(actions.dismiss).toHaveBeenCalledTimes(4)
  })
})

describe('AnnouncementHost', () => {
  const modal = makeAnnouncement({ title: 'Modal one' })
  const banner = makeAnnouncement({
    placement: AnnouncementPlacement.BANNER,
    severity: AnnouncementSeverity.INFO,
    title: 'Banner one',
  })

  it('renders the banner and the modal the server chose', () => {
    provide(makeBoot({ modal, banner }))
    renderAt(<AnnouncementHost />)
    expect(screen.getByText('Banner one')).toBeInTheDocument()
    expect(
      screen.getByRole('dialog', { name: 'Modal one' }),
    ).toBeInTheDocument()
  })

  it('renders nothing when the feature is off or there is no payload', () => {
    provide(makeBoot({ modal }), false)
    const { container, unmount } = renderAt(<AnnouncementHost />)
    expect(container).toBeEmptyDOMElement()
    unmount()

    provide(null)
    expect(renderAt(<AnnouncementHost />).container).toBeEmptyDOMElement()
  })

  it.each(['/login', '/auth/verify', '/auth/onboarding'])(
    'stays quiet during the sign-in flow (%s)',
    (path) => {
      provide(makeBoot({ modal, banner }))
      const { container } = renderAt(<AnnouncementHost />, path)
      expect(container).toBeEmptyDOMElement()
      expect(screen.queryByRole('dialog')).toBeNull()
    },
  )
})

describe('nav badges', () => {
  const badge = makeAnnouncement({
    placement: AnnouncementPlacement.BADGE,
    navKey: AnnouncementNavKey.FORECAST,
    title: 'New forecasts',
  })

  function Probe({ path }: { path: string }) {
    const { badge: found, onVisit } = useNavBadge(path)
    return (
      <button type='button' onClick={onVisit}>
        {found ? `badge:${found.id}` : 'none'}
      </button>
    )
  }

  it('finds the badge for a nav entry, and none for another', () => {
    provide(makeBoot({ badges: [badge] }))
    const { unmount } = renderAt(<Probe path='/forecast' />)
    expect(screen.getByRole('button')).toHaveTextContent(`badge:${badge.id}`)
    unmount()

    renderAt(<Probe path='/news' />)
    expect(screen.getByRole('button')).toHaveTextContent('none')
  })

  it('has none for a route without a badge slot, or without a payload', () => {
    provide(makeBoot({ badges: [badge] }))
    const { unmount } = renderAt(<Probe path='/admin' />)
    expect(screen.getByRole('button')).toHaveTextContent('none')
    unmount()

    provide(null)
    renderAt(<Probe path='/forecast' />)
    expect(screen.getByRole('button')).toHaveTextContent('none')
  })

  it('visiting the entry dismisses a dismissible badge only', async () => {
    provide(makeBoot({ badges: [badge] }))
    const { unmount } = renderAt(<Probe path='/forecast' />)
    await userEvent.click(screen.getByRole('button'))
    expect(actions.dismiss).toHaveBeenCalledWith(badge.id)
    unmount()

    actions.dismiss.mockClear()
    provide(makeBoot({ badges: [{ ...badge, dismissible: false }] }))
    renderAt(<Probe path='/forecast' />)
    await userEvent.click(screen.getByRole('button'))
    expect(actions.dismiss).not.toHaveBeenCalled()
  })

  it('draws a pill, or a dot when the sidebar is collapsed', () => {
    const { unmount } = render(<NavBadgePill badge={badge} collapsed={false} />)
    expect(screen.getByRole('status')).toHaveTextContent('New')
    unmount()

    render(<NavBadgePill badge={badge} collapsed />)
    expect(
      screen.getByRole('status', { name: /New forecasts/ }),
    ).toBeEmptyDOMElement()
  })
})

describe('WhatsNewList', () => {
  it('lists the changelog, newest first as the server sent it, with unread marked', () => {
    const unread = makeAnnouncement({ title: 'Unread one' })
    const read = makeAnnouncement({ title: 'Read one', unread: false })
    provide(bootWithChangelog([unread, read]))
    renderAt(<WhatsNewList onOpen={vi.fn()} />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveAttribute('data-unread', 'true')
    expect(items[1]).toHaveAttribute('data-unread', 'false')
    expect(screen.getAllByText(/Unread|Read/)).toHaveLength(2)
  })

  it('shows an empty state with no entries or no payload', () => {
    provide(makeBoot())
    const { unmount } = renderAt(<WhatsNewList onOpen={vi.fn()} />)
    expect(screen.getByText('Nothing new yet')).toBeInTheDocument()
    unmount()

    provide(null)
    renderAt(<WhatsNewList onOpen={vi.fn()} />)
    expect(screen.getByText('Nothing new yet')).toBeInTheDocument()
  })

  it('marks an entry read from its button, and only unread entries have one', async () => {
    const unread = makeAnnouncement()
    const read = makeAnnouncement({ unread: false })
    provide(bootWithChangelog([unread, read]))
    renderAt(<WhatsNewList onOpen={vi.fn()} />)

    const buttons = screen.getAllByRole('button', { name: 'Mark as read' })
    expect(buttons).toHaveLength(1)
    await userEvent.click(buttons[0])
    expect(actions.markSeen).toHaveBeenCalledWith(unread.id)
  })

  it('marks an entry read and closes the drawer when its link is followed', async () => {
    const onOpen = vi.fn()
    const item = makeAnnouncement({ ctaLabel: 'See it', ctaUrl: '/forecast' })
    provide(bootWithChangelog([item]))
    renderAt(<WhatsNewList onOpen={onOpen} />)

    await userEvent.click(screen.getByRole('link', { name: 'See it' }))
    expect(actions.markSeen).toHaveBeenCalledWith(item.id)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
