import config from '@/config'
import {
  announcementActionValidator,
  announcementContentValidator,
  announcementListQueryValidator,
  createAnnouncementValidator,
  isSafeCtaUrl,
  updateAnnouncementValidator,
} from '../announcement-validation'
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_PRIORITY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
} from '../constants'

const REASON = 'Launching the new forecast panel'

const modal = {
  title: 'Meet the new forecast panel',
  body: 'Faster, clearer signals.',
  placement: 'MODAL',
  reason: REASON,
}

const issuePaths = (result: {
  success: boolean
  error?: { issues: Array<{ path: Array<string | number> }> }
}) => result.error?.issues.map((issue) => issue.path.join('.')) ?? []

describe('isSafeCtaUrl', () => {
  it.each(['/plans', '/forecast?tab=ai#top', 'https://venturedive.com/docs'])(
    'accepts %s',
    (url) => expect(isSafeCtaUrl(url)).toBe(true),
  )

  it.each([
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'data:text/html,<script>',
    'http://insecure.example',
    'https://user:pass@example.com',
    'plans',
    'https://',
    '/with space',
  ])('rejects %s', (url) => expect(isSafeCtaUrl(url)).toBe(false))
})

describe('createAnnouncementValidator', () => {
  it('applies defaults for an otherwise minimal modal', () => {
    const parsed = createAnnouncementValidator.parse(modal)
    expect(parsed).toMatchObject({
      priority: 0,
      dismissible: true,
      inChangelog: true,
      targetPlans: ['ALL'],
      targetRoles: [],
    })
  })

  it('trims text and treats blank optional fields as null', () => {
    const parsed = createAnnouncementValidator.parse({
      ...modal,
      title: '  Hello  ',
      ctaLabel: '  ',
      ctaUrl: '',
      imageUrl: '',
      startsAt: '',
    })
    expect(parsed.title).toBe('Hello')
    expect(parsed.ctaLabel).toBeNull()
    expect(parsed.ctaUrl).toBeNull()
    expect(parsed.imageUrl).toBeNull()
    expect(parsed.startsAt).toBeNull()
  })

  it('enforces length and priority bounds', () => {
    const parse = (overrides: object) =>
      createAnnouncementValidator.safeParse({ ...modal, ...overrides }).success
    expect(parse({ title: 'x'.repeat(ANNOUNCEMENT_TITLE_MAX + 1) })).toBe(false)
    expect(parse({ body: 'x'.repeat(ANNOUNCEMENT_BODY_MAX + 1) })).toBe(false)
    expect(parse({ title: '   ' })).toBe(false)
    expect(parse({ priority: ANNOUNCEMENT_PRIORITY_MAX + 1 })).toBe(false)
    expect(parse({ priority: 1.5 })).toBe(false)
    expect(parse({ placement: 'POPUP' })).toBe(false)
  })

  it('collapses ALL with other plans, de-duplicates, and refuses an empty list', () => {
    expect(
      createAnnouncementValidator.parse({
        ...modal,
        targetPlans: ['FREE', 'ALL', 'PRO'],
      }).targetPlans,
    ).toEqual(['ALL'])
    expect(
      createAnnouncementValidator.parse({
        ...modal,
        targetPlans: ['PRO', 'PRO', 'TEAM'],
        targetRoles: ['OWNER', 'OWNER'],
      }),
    ).toMatchObject({ targetPlans: ['PRO', 'TEAM'], targetRoles: ['OWNER'] })
    expect(
      createAnnouncementValidator.safeParse({ ...modal, targetPlans: [] })
        .success,
    ).toBe(false)
  })

  it('requires a reason', () => {
    const { reason: _omitted, ...withoutReason } = modal
    expect(createAnnouncementValidator.safeParse(withoutReason).success).toBe(
      false,
    )
    expect(
      createAnnouncementValidator.safeParse({ ...modal, reason: 'short' })
        .success,
    ).toBe(false)
  })

  it('requires a ticket only when configured, and validates its format when given', () => {
    const original = config.admin.requireTicketRef
    try {
      ;(config.admin as any).requireTicketRef = true
      expect(createAnnouncementValidator.safeParse(modal).success).toBe(false)
      expect(
        createAnnouncementValidator.safeParse({ ...modal, ticketRef: 'SUP-1' })
          .success,
      ).toBe(true)
      ;(config.admin as any).requireTicketRef = false
      expect(createAnnouncementValidator.safeParse(modal).success).toBe(true)
      expect(
        createAnnouncementValidator.safeParse({ ...modal, ticketRef: 'bad' })
          .success,
      ).toBe(false)
    } finally {
      ;(config.admin as any).requireTicketRef = original
    }
  })

  describe('placement rules', () => {
    const check = (overrides: object) =>
      issuePaths(
        createAnnouncementValidator.safeParse({ ...modal, ...overrides }),
      )

    it('needs an anchor for a SPOTLIGHT and only for a SPOTLIGHT', () => {
      expect(check({ placement: 'SPOTLIGHT' })).toContain('anchor')
      expect(
        check({ placement: 'SPOTLIGHT', anchor: 'WATCHLIST_ADD' }),
      ).toEqual([])
      expect(check({ anchor: 'WATCHLIST_ADD' })).toContain('anchor')
      expect(
        createAnnouncementValidator.safeParse({
          ...modal,
          placement: 'SPOTLIGHT',
          anchor: '.any > selector',
        }).success,
      ).toBe(false)
    })

    it('needs a navKey for a BADGE and only for a BADGE', () => {
      expect(check({ placement: 'BADGE' })).toContain('navKey')
      expect(check({ placement: 'BADGE', navKey: 'FORECAST' })).toEqual([])
      expect(check({ navKey: 'FORECAST' })).toContain('navKey')
    })

    it('needs a severity for a BANNER and only for a BANNER', () => {
      expect(check({ placement: 'BANNER' })).toContain('severity')
      expect(check({ placement: 'BANNER', severity: 'WARNING' })).toEqual([])
      expect(check({ severity: 'INFO' })).toContain('severity')
    })

    it('keeps a CHANGELOG entry in the changelog', () => {
      expect(check({ placement: 'CHANGELOG', inChangelog: false })).toContain(
        'inChangelog',
      )
      expect(check({ placement: 'CHANGELOG' })).toEqual([])
    })

    it('keeps a MODAL or SPOTLIGHT dismissible, but lets a banner or badge stay', () => {
      expect(check({ dismissible: false })).toContain('dismissible')
      expect(
        check({
          placement: 'SPOTLIGHT',
          anchor: 'WATCHLIST_ADD',
          dismissible: false,
        }),
      ).toContain('dismissible')
      expect(
        check({
          placement: 'BANNER',
          severity: 'CRITICAL',
          dismissible: false,
        }),
      ).toEqual([])
      expect(
        check({ placement: 'BADGE', navKey: 'PLANS', dismissible: false }),
      ).toEqual([])
    })

    it('needs a CTA label and URL together', () => {
      expect(check({ ctaLabel: 'Try it' })).toContain('ctaUrl')
      expect(check({ ctaUrl: '/plans' })).toContain('ctaUrl')
      expect(check({ ctaLabel: 'Try it', ctaUrl: '/plans' })).toEqual([])
      expect(
        check({ ctaLabel: 'Try it', ctaUrl: 'javascript:alert(1)' }),
      ).not.toEqual([])
    })

    it('only allows an https image', () => {
      expect(check({ imageUrl: 'https://cdn.example/a.png' })).toEqual([])
      expect(check({ imageUrl: 'http://cdn.example/a.png' })).not.toEqual([])
    })
  })

  describe('schedule', () => {
    const check = (overrides: object) =>
      issuePaths(
        createAnnouncementValidator.safeParse({ ...modal, ...overrides }),
      )

    it('accepts a window and an open end', () => {
      expect(
        check({
          startsAt: '2026-10-08T00:00:00Z',
          endsAt: '2026-10-09T00:00:00Z',
        }),
      ).toEqual([])
      expect(check({ startsAt: '2026-10-08T00:00:00+05:00' })).toEqual([])
    })

    it('rejects an end that is not after the start, and non-ISO dates', () => {
      expect(
        check({
          startsAt: '2026-10-08T00:00:00Z',
          endsAt: '2026-10-08T00:00:00Z',
        }),
      ).toContain('endsAt')
      expect(check({ startsAt: 'tomorrow' })).toContain('startsAt')
    })
  })
})

describe('announcementContentValidator', () => {
  it('validates a merged announcement without the audit fields', () => {
    const { reason: _omitted, ...content } = modal
    expect(announcementContentValidator.safeParse(content).success).toBe(true)
  })
})

describe('updateAnnouncementValidator', () => {
  it('accepts a partial change with the version and a reason', () => {
    const parsed = updateAnnouncementValidator.parse({
      title: 'New title',
      expectedVersion: 3,
      reason: REASON,
    })
    expect(parsed.title).toBe('New title')
    // Absent fields stay absent, so a PATCH never resets them to a default.
    expect(parsed).not.toHaveProperty('priority')
    expect(parsed).not.toHaveProperty('targetPlans')
  })

  it('lets a field be cleared with null', () => {
    expect(
      updateAnnouncementValidator.parse({
        ctaUrl: null,
        expectedVersion: 1,
        reason: REASON,
      }).ctaUrl,
    ).toBeNull()
  })

  it('requires expectedVersion and a reason', () => {
    expect(
      updateAnnouncementValidator.safeParse({ title: 'x', reason: REASON })
        .success,
    ).toBe(false)
    expect(
      updateAnnouncementValidator.safeParse({ title: 'x', expectedVersion: 1 })
        .success,
    ).toBe(false)
    expect(
      updateAnnouncementValidator.safeParse({
        expectedVersion: 0,
        reason: REASON,
      }).success,
    ).toBe(false)
  })
})

describe('announcementActionValidator', () => {
  it('needs a reason and validates the optional ticket', () => {
    expect(
      announcementActionValidator.safeParse({ reason: REASON }).success,
    ).toBe(true)
    expect(announcementActionValidator.safeParse({}).success).toBe(false)
    expect(
      announcementActionValidator.safeParse({
        reason: REASON,
        ticketRef: 'nope',
      }).success,
    ).toBe(false)
  })
})

describe('announcementListQueryValidator', () => {
  it('defaults paging and filters by enum', () => {
    expect(announcementListQueryValidator.parse({})).toMatchObject({
      page: 1,
      limit: 25,
    })
    expect(
      announcementListQueryValidator.parse({
        status: 'PUBLISHED',
        placement: 'BANNER',
        limit: '10',
      }),
    ).toMatchObject({ status: 'PUBLISHED', placement: 'BANNER', limit: 10 })
    expect(
      announcementListQueryValidator.safeParse({ status: 'LIVE' }).success,
    ).toBe(false)
    expect(
      announcementListQueryValidator.safeParse({ limit: '101' }).success,
    ).toBe(false)
  })
})
