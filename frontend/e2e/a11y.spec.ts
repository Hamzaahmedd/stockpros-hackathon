import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mockLoggedIn, mockLoggedOut } from './mocks'

/** The axe rule sets that make up WCAG 2.2 Level AA (A and AA criteria of 2.0, 2.1 and 2.2). */
const WCAG_22_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const scan = async (page: Page) =>
  new AxeBuilder({ page }).withTags(WCAG_22_AA_TAGS).analyze()

const summarize = (
  violations: Awaited<ReturnType<typeof scan>>['violations'],
): string[] =>
  violations.flatMap((v) =>
    v.nodes.map(
      (n) =>
        `${v.id} (${v.impact}) ${n.target.join(' ')} :: ${n.html.slice(0, 140)}`,
    ),
  )

/** Anything the page asks the API for that a test did not mock gets an empty envelope, so pages render without a backend. */
const mockEmptyApi = async (page: Page): Promise<void> => {
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({ status: 200, json: { data: [] } }),
  )
}

const signIn = async (page: Page): Promise<void> => {
  await mockEmptyApi(page)
  await mockLoggedIn(
    page,
    {
      userId: 'a11y-user',
      email: 'a11y@example.com',
      displayName: 'A11y User',
      phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
      plan: 'FREE',
      platformRole: 'USER',
    },
    { pricingTiersEnabled: true },
  )
  await page.route('**/api/v1/rbac/user-screens', (route) =>
    route.fulfill({
      status: 200,
      json: { data: { CORE_APP: { canRead: true } } },
    }),
  )
  await page.route('**/api/v1/auth/sessions', (route) =>
    route.fulfill({
      status: 200,
      json: {
        data: [
          {
            id: 's1',
            device: 'Chrome (Windows)',
            location: 'Karachi, Sindh, PK',
            createdAt: '2026-09-26T02:08:00.000Z',
            updatedAt: '2026-10-07T12:12:00.000Z',
            isCurrent: true,
          },
          {
            id: 's2',
            device: 'Safari (iOS)',
            location: null,
            createdAt: '2026-10-01T09:00:00.000Z',
            updatedAt: '2026-10-06T09:00:00.000Z',
            isCurrent: false,
          },
        ],
      },
    }),
  )
}

/** A scan of the "Access denied" screen or a redirect would pass trivially, so prove the real page rendered. */
const expectPageRendered = async (page: Page, path: string): Promise<void> => {
  expect(new URL(page.url()).pathname).toBe(path)
  await expect(page.getByText('Access denied')).toHaveCount(0)
}

const PUBLIC_PAGES = ['/login', '/this-page-does-not-exist']
const SIGNED_IN_PAGES = [
  '/dashboard',
  '/market',
  '/news',
  '/watchlist',
  '/settings',
  '/plans',
]

const THEMES = ['light', 'dark'] as const

/** Both themes ship, and contrast failures are usually specific to one of them. */
const useTheme = async (
  page: Page,
  theme: (typeof THEMES)[number],
): Promise<void> => {
  await page.addInitScript((value) => {
    localStorage.setItem('theme', value)
  }, theme)
}

for (const theme of THEMES) {
  test.describe(`WCAG 2.2 AA (automated axe scan, ${theme} theme)`, () => {
    for (const path of PUBLIC_PAGES) {
      test(`${path} has no violations`, async ({ page }) => {
        await useTheme(page, theme)
        await mockEmptyApi(page)
        await mockLoggedOut(page)
        await page.goto(path)
        await page.waitForLoadState('networkidle')

        const { violations } = await scan(page)
        expect(summarize(violations)).toEqual([])
      })
    }

    for (const path of SIGNED_IN_PAGES) {
      test(`${path} has no violations`, async ({ page }) => {
        await useTheme(page, theme)
        await signIn(page)
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        await expectPageRendered(page, path)

        const { violations } = await scan(page)
        expect(summarize(violations)).toEqual([])
      })
    }

    test('/settings Account tab (active sessions) has no violations', async ({
      page,
    }) => {
      await useTheme(page, theme)
      await signIn(page)
      await page.goto('/settings')
      await page
        .getByRole('button', { name: /account/i })
        .first()
        .click()
      await expect(
        page.getByText('Active sessions', { exact: true }),
      ).toBeVisible()

      const { violations } = await scan(page)
      expect(summarize(violations)).toEqual([])
    })
  })
}
