import {
  AnnouncementAnchor,
  AnnouncementNavKey,
  AnnouncementPlacement,
  AnnouncementSeverity,
} from '@/modules/announcements'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EMPTY_DRAFT, type AnnouncementDraft } from '../announcement-form'
import { AnnouncementPreview } from './AnnouncementPreview'

const draft = (
  overrides: Partial<AnnouncementDraft> = {},
): AnnouncementDraft => ({
  ...EMPTY_DRAFT,
  title: 'Big news',
  body: 'It is here.',
  ...overrides,
})

describe('AnnouncementPreview', () => {
  it('shows placeholder copy before anything is typed', () => {
    render(<AnnouncementPreview draft={EMPTY_DRAFT} />)
    expect(screen.getByText('Your title')).toBeInTheDocument()
    expect(screen.getByText('Your message appears here.')).toBeInTheDocument()
  })

  it('sketches a modal with its button and image slot', () => {
    render(
      <AnnouncementPreview
        draft={draft({
          ctaLabel: 'Try it',
          ctaUrl: '/forecast',
          imageUrl: 'https://x.example/a.png',
        })}
      />,
    )
    expect(screen.getByText('Big news')).toBeInTheDocument()
    expect(screen.getByText('Got it')).toBeInTheDocument()
    expect(screen.getByText('Try it')).toBeInTheDocument()
    expect(screen.getByText('Image')).toBeInTheDocument()
  })

  it('sketches a changelog entry without a dismiss button', () => {
    render(
      <AnnouncementPreview
        draft={draft({ placement: AnnouncementPlacement.CHANGELOG })}
      />,
    )
    expect(screen.queryByText('Got it')).toBeNull()
  })

  it('sketches a banner in its severity colours, with the link', () => {
    render(
      <AnnouncementPreview
        draft={draft({
          placement: AnnouncementPlacement.BANNER,
          severity: AnnouncementSeverity.CRITICAL,
          ctaLabel: 'Status',
          ctaUrl: 'https://status.example.com',
        })}
      />,
    )
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Big news').closest('div')).toHaveClass(
      'bg-red-600',
    )
  })

  it('falls back to the info style for a banner with no severity yet', () => {
    render(
      <AnnouncementPreview
        draft={draft({ placement: AnnouncementPlacement.BANNER })}
      />,
    )
    expect(screen.getByText('Big news').closest('div')).toHaveClass(
      'bg-primary',
    )
  })

  it('sketches a spotlight and what it points at', () => {
    const { unmount } = render(
      <AnnouncementPreview
        draft={draft({ placement: AnnouncementPlacement.SPOTLIGHT })}
      />,
    )
    expect(screen.getByText('Points at: choose a target')).toBeInTheDocument()
    unmount()

    render(
      <AnnouncementPreview
        draft={draft({
          placement: AnnouncementPlacement.SPOTLIGHT,
          anchor: AnnouncementAnchor.WATCHLIST_ADD,
          ctaLabel: 'Open',
          ctaUrl: '/watchlist',
        })}
      />,
    )
    expect(screen.getByText('Points at: WATCHLIST_ADD')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('sketches a badge on its menu entry', () => {
    const { unmount } = render(
      <AnnouncementPreview
        draft={draft({ placement: AnnouncementPlacement.BADGE })}
      />,
    )
    expect(screen.getByText('Menu entry')).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()
    unmount()

    render(
      <AnnouncementPreview
        draft={draft({
          placement: AnnouncementPlacement.BADGE,
          navKey: AnnouncementNavKey.FORECAST,
        })}
      />,
    )
    expect(screen.getByText('forecast')).toBeInTheDocument()
  })

  it('shows markup as text', () => {
    render(
      <AnnouncementPreview
        draft={draft({ body: '<img src=x onerror=alert(1)>' })}
      />,
    )
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
  })
})
