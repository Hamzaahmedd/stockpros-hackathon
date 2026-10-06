import { expect, test, type Page } from '@playwright/test'
import { mockLoggedIn } from './mocks'

// Covers what a signed-in user sees from the announcement engine: the modal,
// banner and nav badge from the boot payload, dismissal that survives a reload,
// and the What's New tab in the bell. All network is mocked — no real backend/DB,
// per e2e/README.md.

const announcement = (overrides: Record<string, unknown> = {}) => ({
  id: 'ann-1',
  title: 'Meet the new forecast panel',
  body: 'Faster, clearer signals.',
  ctaLabel: null,
  ctaUrl: null,
  imageUrl: null,
  placement: 'MODAL',
  severity: null,
  anchor: null,
  navKey: null,
  priority: 0,
  dismissible: true,
  publishedAt: '2026-10-07T12:00:00.000Z',
  unread: true,
  ...overrides,
})

const boot = (overrides: Record<string, unknown> = {}) => ({
  modal: null,
  banner: null,
  spotlight: null,
  badges: [],
  changelog: { items: [], unreadCount: 0 },
  ...overrides,
})

const signIn = async (page: Page, announcements: unknown): Promise<void> => {
  await mockLoggedIn(
    page,
    {
      userId: 'e2e-user-1',
      email: 'e2e-user@example.com',
      displayName: 'Alex Morgan',
      phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
      plan: 'PRO',
    },
    { pricingTiersEnabled: true, enablePaymentProcessor: true },
  )
  // Registered after mockLoggedIn, so it wins: the same user plus the announcements slice.
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      json: {
        user: {
          userId: 'e2e-user-1',
          email: 'e2e-user@example.com',
          displayName: 'Alex Morgan',
          phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
          plan: 'PRO',
        },
        pricingTiersEnabled: true,
        enablePaymentProcessor: true,
        announcements,
      },
    }),
  )
  await page.route('**/api/v1/rbac/user-screens', (route) =>
    route.fulfill({
      status: 200,
      json: { data: { CORE_APP: { canRead: true } } },
    }),
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
  await page.route('**/api/v1/payments/**', (route) =>
    route.fulfill({ status: 200, json: { success: true, data: {} } }),
  )
}

test.describe('Announcements', () => {
  test('a modal shows, is dismissed for good, and stays gone after a reload', async ({
    page,
  }) => {
    const modal = announcement()
    const dismissed: string[] = []

    await signIn(page, boot({ modal }))
    await page.route('**/api/v1/announcements/*/seen', (route) =>
      route.fulfill({ status: 200, json: { success: true } }),
    )
    await page.route('**/api/v1/announcements/*/dismiss', (route) => {
      dismissed.push(route.request().url())
      return route.fulfill({ status: 200, json: { success: true } })
    })

    await page.goto('/settings')
    const dialog = page.getByRole('dialog', { name: modal.title })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(modal.body)).toBeVisible()

    await dialog.getByRole('button', { name: 'Got it' }).click()
    await expect(dialog).toBeHidden()
    expect(dismissed).toHaveLength(1)
    expect(dismissed[0]).toContain('/api/v1/announcements/ann-1/dismiss')

    // After the dismissal the server no longer returns it, so a reload shows nothing.
    await page.unroute('**/api/v1/auth/me')
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 200,
        json: {
          user: {
            userId: 'e2e-user-1',
            email: 'e2e-user@example.com',
            plan: 'PRO',
          },
          pricingTiersEnabled: true,
          enablePaymentProcessor: true,
          announcements: boot({
            changelog: { items: [{ ...modal, unread: false }], unreadCount: 0 },
          }),
        },
      }),
    )
    await page.reload()
    await expect(page.getByRole('dialog', { name: modal.title })).toHaveCount(0)
  })

  test('a banner shows as a notice and a critical one cannot be dismissed', async ({
    page,
  }) => {
    const banner = announcement({
      id: 'ann-2',
      title: 'Scheduled maintenance tonight',
      placement: 'BANNER',
      severity: 'CRITICAL',
      dismissible: false,
    })
    await signIn(page, boot({ banner }))

    await page.goto('/settings')
    await expect(
      page.getByRole('alert').filter({ hasText: banner.title }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Dismiss announcement' }),
    ).toHaveCount(0)
  })

  test('a nav badge decorates its menu entry', async ({ page }) => {
    const badge = announcement({
      id: 'ann-3',
      title: 'New forecasts',
      placement: 'BADGE',
      navKey: 'FORECAST',
    })
    await signIn(page, boot({ badges: [badge] }))

    await page.goto('/settings')
    const forecast = page.getByRole('link', { name: /Forecast/ })
    await expect(forecast.getByText('New')).toBeVisible()
  })

  test("the bell's What's New tab lists the changelog and marks it read", async ({
    page,
  }) => {
    const entry = announcement({
      id: 'ann-4',
      title: 'Weekly digest is here',
      placement: 'CHANGELOG',
    })
    const marked: string[] = []
    await signIn(page, boot({ changelog: { items: [entry], unreadCount: 1 } }))
    await page.route('**/api/v1/announcements/seen', (route) => {
      marked.push(route.request().url())
      return route.fulfill({ status: 200, json: { success: true } })
    })

    await page.goto('/settings')
    await page.getByTitle('Alerts & Notifications').click()
    await page.getByRole('button', { name: /What's New/ }).click()

    await expect(page.getByText(entry.title)).toBeVisible()
    await page.getByRole('button', { name: 'MARK ALL READ' }).click()
    await expect.poll(() => marked.length).toBe(1)
  })

  test("with the feature off nothing renders and there is no What's New tab", async ({
    page,
  }) => {
    await signIn(page, null)

    await page.goto('/settings')
    await page.getByTitle('Alerts & Notifications').click()
    await expect(page.getByRole('button', { name: /What's New/ })).toHaveCount(
      0,
    )
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
