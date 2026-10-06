import { expect, test, type Page } from '@playwright/test'
import { mockLoggedIn } from './mocks'

// Covers sending feedback from the sidebar (category + browser context) and the
// admin triage list (status tabs and marking entries). All network is mocked —
// no real backend/DB, per e2e/README.md.

const signIn = async (page: Page, canTriage: boolean): Promise<void> => {
  await mockLoggedIn(page, {
    userId: 'e2e-user-1',
    email: 'e2e-user@example.com',
    displayName: 'Alex Morgan',
    phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
    plan: 'PRO',
  })
  const screens = {
    CORE_APP: { canRead: true, canWrite: true },
    ...(canTriage
      ? { ROLE: { canRead: true }, ACCESS_CONTROL: { canRead: true } }
      : {}),
  }
  await page.route('**/api/v1/rbac/user-screens', (route) =>
    route.fulfill({ status: 200, json: { data: screens } }),
  )
  // The sidebar bell and the page itself call these; empty answers keep the run quiet.
  await page.route('**/api/v1/notifications', (route) =>
    route.fulfill({ status: 200, json: { success: true, data: [] } }),
  )
  await page.route('**/api/v1/notifications/summary', (route) =>
    route.fulfill({
      status: 200,
      json: { success: true, data: { unreadCount: 0 } },
    }),
  )
  await page.route('**/api/v1/news/**', (route) =>
    route.fulfill({
      status: 200,
      json: {
        success: true,
        data: {
          portfolioNews: [],
          watchlistNews: [],
          marketHeadlines: [],
          unreadCount: 0,
        },
      },
    }),
  )
}

const entry = (overrides: Record<string, unknown> = {}) => ({
  id: 'fb-1',
  message: 'The chart is blank on mobile',
  page: '/forecast',
  category: 'BUG',
  status: 'NEW',
  metadata: {
    planTier: 'PRO',
    userAgent: 'Mozilla/5.0 (e2e)',
    viewport: { width: 390, height: 844 },
    appVersion: '1.0.0',
  },
  statusUpdatedAt: null,
  createdAt: '2026-10-07T12:00:00.000Z',
  user: { id: 'u1', displayName: 'Sam Lee', email: 'sam@fund.com' },
  ...overrides,
})

test.describe('Sending feedback', () => {
  test('sends the category, the page and the browser context', async ({
    page,
  }) => {
    await signIn(page, false)
    let body: Record<string, any> | null = null
    await page.route('**/api/v1/feedback', (route) => {
      body = route.request().postDataJSON()
      return route.fulfill({
        status: 201,
        json: { success: true, data: { id: 'fb-1' } },
      })
    })

    await page.goto('/settings')
    await page.getByTitle('Send feedback').click()
    await page.getByRole('radio', { name: 'Bug' }).click()
    await page.getByPlaceholder(/on your mind/).fill('The chart is blank')
    await expect(
      page.getByText(
        'We include your browser and screen size to help us debug.',
      ),
    ).toBeVisible()
    await page.getByText('Send feedback', { exact: true }).last().click()

    await expect(page.getByText('Thanks for the feedback!')).toBeVisible()
    expect(body).toMatchObject({
      message: 'The chart is blank',
      page: '/settings',
      category: 'BUG',
    })
    expect(body!.metadata.appVersion).toMatch(/^\d+\.\d+\.\d+/)
    expect(body!.metadata.viewport.width).toBeGreaterThan(0)
    expect(typeof body!.metadata.userAgent).toBe('string')
    // The plan is the server's to read from the session.
    expect(body!.metadata).not.toHaveProperty('planTier')
  })

  test('shows the rate-limit message and keeps the draft', async ({ page }) => {
    await signIn(page, false)
    await page.route('**/api/v1/feedback', (route) =>
      route.fulfill({
        status: 429,
        json: {
          success: false,
          message:
            'You are sending feedback too quickly. Please wait a minute.',
        },
      }),
    )

    await page.goto('/settings')
    await page.getByTitle('Send feedback').click()
    await page.getByPlaceholder(/on your mind/).fill('again')
    await page.getByText('Send feedback', { exact: true }).last().click()

    await expect(page.getByText(/sending feedback too quickly/)).toBeVisible()
    await expect(page.getByPlaceholder(/on your mind/)).toHaveValue('again')
  })
})

test.describe('Feedback triage', () => {
  test('opens on New, switches tabs and marks an entry read', async ({
    page,
  }) => {
    await signIn(page, true)
    const statuses: unknown[] = []
    let marked = false

    await page.route('**/api/v1/feedback?*', (route) => {
      const status = new URL(route.request().url()).searchParams.get('status')
      const items =
        status === 'NEW' && !marked
          ? [entry()]
          : status === 'READ' && marked
            ? [entry({ status: 'READ' })]
            : []
      return route.fulfill({
        status: 200,
        json: {
          success: true,
          data: items,
          extra: {
            nextCursor: null,
            hasMore: false,
            total: items.length,
            counts: marked
              ? { NEW: 0, READ: 1, ARCHIVED: 0 }
              : { NEW: 1, READ: 0, ARCHIVED: 0 },
          },
        },
      })
    })
    await page.route('**/api/v1/feedback/fb-1/status', (route) => {
      statuses.push(route.request().postDataJSON())
      marked = true
      return route.fulfill({
        status: 200,
        json: {
          success: true,
          data: { id: 'fb-1', status: 'READ', changed: true },
        },
      })
    })

    await page.goto('/access-control/feedback')

    await expect(page.getByText('The chart is blank on mobile')).toBeVisible()
    await expect(page.getByRole('tab', { name: /New\s*1/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByText('Bug', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: /Technical details/ }).click()
    await expect(page.getByText('Mozilla/5.0 (e2e)')).toBeVisible()
    await expect(page.getByText('390 × 844')).toBeVisible()

    await page.getByRole('button', { name: 'Mark read' }).click()
    await expect(
      page.getByText('Nothing new. You are all caught up.'),
    ).toBeVisible()
    expect(statuses).toEqual([{ status: 'READ' }])

    await page.getByRole('tab', { name: /Read\s*1/ }).click()
    await expect(page.getByText('The chart is blank on mobile')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Mark unread' }),
    ).toBeVisible()
  })
})
