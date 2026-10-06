import {
  AnnouncementAnchor,
  AnnouncementNavKey,
  AnnouncementPlacement,
  AnnouncementPlanTarget,
  AnnouncementSeverity,
  AnnouncementStatus,
  AnnouncementTeamRole,
} from '@/modules/announcements'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_DRAFT,
  audienceSummary,
  isSafeCtaUrl,
  isoToLocalInput,
  localInputToIso,
  toDraft,
  togglePlan,
  toggleRole,
  toPayload,
  validateDraft,
  type AnnouncementDraft,
} from './announcement-form'
import type { AdminAnnouncement } from './types'

const valid = (
  overrides: Partial<AnnouncementDraft> = {},
): AnnouncementDraft => ({
  ...EMPTY_DRAFT,
  title: 'Meet the forecast panel',
  body: 'Faster, clearer signals.',
  ...overrides,
})

const STORED: AdminAnnouncement = {
  id: 'a1',
  title: 'Stored',
  body: 'Stored body',
  ctaLabel: 'Open',
  ctaUrl: '/plans',
  imageUrl: null,
  placement: AnnouncementPlacement.BANNER,
  severity: AnnouncementSeverity.WARNING,
  anchor: null,
  navKey: null,
  priority: 3,
  dismissible: false,
  inChangelog: true,
  targetPlans: [AnnouncementPlanTarget.PRO],
  targetRoles: [AnnouncementTeamRole.ADMIN],
  startsAt: '2026-10-08T09:30:00.000Z',
  endsAt: null,
  publishedAt: null,
  status: AnnouncementStatus.DRAFT,
  isEnabled: true,
  version: 4,
  reannounceEpoch: 1,
  createdAt: '2026-10-07T00:00:00.000Z',
  updatedAt: '2026-10-07T00:00:00.000Z',
}

describe('date conversion', () => {
  it('round-trips an instant through the local input format', () => {
    const iso = '2026-10-08T09:30:00.000Z'
    expect(localInputToIso(isoToLocalInput(iso))).toBe(iso)
  })

  it('treats blank, null and garbage as no date', () => {
    expect(isoToLocalInput(null)).toBe('')
    expect(localInputToIso('')).toBeNull()
    expect(localInputToIso('not a date')).toBeNull()
  })
})

describe('isSafeCtaUrl', () => {
  it('accepts in-app paths and https, and rejects the dangerous forms', () => {
    expect(isSafeCtaUrl('/plans')).toBe(true)
    expect(isSafeCtaUrl('https://example.com/a')).toBe(true)
    for (const bad of [
      '//evil.example',
      '/\\evil',
      'javascript:alert(1)',
      'http://example.com',
      'https://u:p@example.com',
      'plans',
      '/a b',
    ]) {
      expect(isSafeCtaUrl(bad)).toBe(false)
    }
  })
})

describe('validateDraft', () => {
  it('accepts a minimal modal', () => {
    expect(validateDraft(valid())).toEqual([])
  })

  it('requires a title and a body, within their limits', () => {
    expect(validateDraft(valid({ title: ' ' }))).toContain('Title is required.')
    expect(validateDraft(valid({ body: '' }))).toContain('Body is required.')
    expect(validateDraft(valid({ title: 'x'.repeat(121) })).join()).toMatch(
      /Title can be at most 120/,
    )
    expect(validateDraft(valid({ body: 'x'.repeat(1001) })).join()).toMatch(
      /Body can be at most 1000/,
    )
  })

  it('asks for what each placement needs', () => {
    expect(
      validateDraft(valid({ placement: AnnouncementPlacement.BANNER })),
    ).toContain('Choose a severity for the banner.')
    expect(
      validateDraft(valid({ placement: AnnouncementPlacement.SPOTLIGHT })),
    ).toContain('Choose what the spotlight points at.')
    expect(
      validateDraft(valid({ placement: AnnouncementPlacement.BADGE })),
    ).toContain('Choose which menu entry gets the badge.')

    expect(
      validateDraft(
        valid({
          placement: AnnouncementPlacement.BANNER,
          severity: AnnouncementSeverity.INFO,
        }),
      ),
    ).toEqual([])
  })

  it('keeps a modal, spotlight and changelog entry usable', () => {
    expect(validateDraft(valid({ dismissible: false }))).toContain(
      'A modal or spotlight must be dismissible.',
    )
    expect(
      validateDraft(
        valid({
          placement: AnnouncementPlacement.CHANGELOG,
          inChangelog: false,
        }),
      ),
    ).toContain('A changelog entry must be listed in the changelog.')
    expect(
      validateDraft(
        valid({
          placement: AnnouncementPlacement.BANNER,
          severity: AnnouncementSeverity.CRITICAL,
          dismissible: false,
        }),
      ),
    ).toEqual([])
  })

  it('needs the button label and link together, and a safe link and image', () => {
    expect(validateDraft(valid({ ctaLabel: 'Go' }))).toContain(
      'Give the button both a label and a link, or neither.',
    )
    expect(validateDraft(valid({ ctaUrl: '/plans' }))).toContain(
      'Give the button both a label and a link, or neither.',
    )
    expect(
      validateDraft(valid({ ctaLabel: 'Go', ctaUrl: 'javascript:alert(1)' })),
    ).toContain('The link must be an in-app path (/plans) or an https URL.')
    expect(
      validateDraft(
        valid({ ctaLabel: 'x'.repeat(41), ctaUrl: '/plans' }),
      ).join(),
    ).toMatch(/Button label can be at most 40/)
    expect(
      validateDraft(valid({ imageUrl: 'http://x.example/a.png' })),
    ).toContain('The image must be an https URL.')
    expect(
      validateDraft(
        valid({
          ctaLabel: 'Go',
          ctaUrl: '/plans',
          imageUrl: 'https://x.example/a.png',
        }),
      ),
    ).toEqual([])
  })

  it('bounds the priority and needs an audience', () => {
    expect(validateDraft(valid({ priority: 101 })).join()).toMatch(/Priority/)
    expect(validateDraft(valid({ priority: 1.5 })).join()).toMatch(/Priority/)
    expect(validateDraft(valid({ targetPlans: [] }))).toContain(
      'Pick at least one plan (or All plans).',
    )
  })

  it('needs the end to follow the start', () => {
    expect(
      validateDraft(
        valid({ startsAt: '2026-10-08T10:00', endsAt: '2026-10-08T09:00' }),
      ),
    ).toContain('The end must be after the start.')
    expect(
      validateDraft(
        valid({ startsAt: '2026-10-08T09:00', endsAt: '2026-10-08T10:00' }),
      ),
    ).toEqual([])
  })
})

describe('toPayload', () => {
  it('trims text and turns blanks into null', () => {
    const payload = toPayload(
      valid({ title: '  Hi  ', ctaLabel: ' ', ctaUrl: '', imageUrl: '' }),
    )
    expect(payload).toMatchObject({
      title: 'Hi',
      ctaLabel: null,
      ctaUrl: null,
      imageUrl: null,
      startsAt: null,
      endsAt: null,
    })
  })

  it('only sends the field the placement uses', () => {
    const stale = {
      severity: AnnouncementSeverity.INFO,
      anchor: AnnouncementAnchor.WATCHLIST_ADD,
      navKey: AnnouncementNavKey.NEWS,
    } as const

    expect(
      toPayload(valid({ ...stale, placement: AnnouncementPlacement.BANNER })),
    ).toMatchObject({ severity: 'INFO', anchor: null, navKey: null })
    expect(
      toPayload(
        valid({ ...stale, placement: AnnouncementPlacement.SPOTLIGHT }),
      ),
    ).toMatchObject({ severity: null, anchor: 'WATCHLIST_ADD', navKey: null })
    expect(
      toPayload(valid({ ...stale, placement: AnnouncementPlacement.BADGE })),
    ).toMatchObject({ severity: null, anchor: null, navKey: 'NEWS' })
    expect(toPayload(valid({ ...stale }))).toMatchObject({
      severity: null,
      anchor: null,
      navKey: null,
    })
  })

  it('sends the audience and schedule as ISO instants', () => {
    const payload = toPayload(
      valid({
        targetPlans: [AnnouncementPlanTarget.PRO],
        targetRoles: [AnnouncementTeamRole.OWNER],
        startsAt: isoToLocalInput('2026-10-08T09:30:00.000Z'),
      }),
    )
    expect(payload.startsAt).toBe('2026-10-08T09:30:00.000Z')
    expect(payload.targetPlans).toEqual(['PRO'])
    expect(payload.targetRoles).toEqual(['OWNER'])
  })
})

describe('toDraft', () => {
  it('loads a stored announcement into the editor shape', () => {
    const draft = toDraft(STORED)
    expect(draft).toMatchObject({
      title: 'Stored',
      severity: 'WARNING',
      anchor: '',
      navKey: '',
      imageUrl: '',
      priority: 3,
      dismissible: false,
      endsAt: '',
    })
    expect(localInputToIso(draft.startsAt)).toBe(STORED.startsAt)
  })

  it('round-trips through the payload without changing anything', () => {
    const payload = toPayload(toDraft(STORED))
    expect(payload).toMatchObject({
      title: STORED.title,
      body: STORED.body,
      placement: STORED.placement,
      severity: STORED.severity,
      ctaLabel: STORED.ctaLabel,
      ctaUrl: STORED.ctaUrl,
      startsAt: STORED.startsAt,
      endsAt: null,
    })
  })

  it('fills nulls from a stored announcement with every optional field set', () => {
    const draft = toDraft({
      ...STORED,
      placement: AnnouncementPlacement.SPOTLIGHT,
      severity: null,
      anchor: AnnouncementAnchor.FORECAST_PANEL,
      imageUrl: 'https://x.example/a.png',
      endsAt: '2026-10-09T09:30:00.000Z',
    })
    expect(draft.anchor).toBe('FORECAST_PANEL')
    expect(draft.severity).toBe('')
    expect(draft.imageUrl).toBe('https://x.example/a.png')
    expect(draft.endsAt).not.toBe('')
  })
})

describe('toggles', () => {
  it('"All plans" replaces the others, and a specific plan replaces "All plans"', () => {
    expect(
      togglePlan([AnnouncementPlanTarget.PRO], AnnouncementPlanTarget.ALL),
    ).toEqual(['ALL'])
    expect(
      togglePlan([AnnouncementPlanTarget.ALL], AnnouncementPlanTarget.PRO),
    ).toEqual(['PRO'])
    expect(
      togglePlan([AnnouncementPlanTarget.PRO], AnnouncementPlanTarget.TEAM),
    ).toEqual(['PRO', 'TEAM'])
    expect(
      togglePlan([AnnouncementPlanTarget.PRO], AnnouncementPlanTarget.PRO),
    ).toEqual([])
  })

  it('adds and removes roles', () => {
    expect(toggleRole([], AnnouncementTeamRole.ADMIN)).toEqual(['ADMIN'])
    expect(
      toggleRole([AnnouncementTeamRole.ADMIN], AnnouncementTeamRole.ADMIN),
    ).toEqual([])
  })
})

describe('audienceSummary', () => {
  it('says who sees it', () => {
    expect(audienceSummary([AnnouncementPlanTarget.ALL], [])).toBe('All plans')
    expect(
      audienceSummary(
        [AnnouncementPlanTarget.PRO, AnnouncementPlanTarget.TEAM],
        [AnnouncementTeamRole.OWNER],
      ),
    ).toBe('PRO, TEAM · OWNER')
  })
})
