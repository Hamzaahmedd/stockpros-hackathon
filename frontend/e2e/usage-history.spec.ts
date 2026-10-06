import { expect, test, type Page } from '@playwright/test'
import { mockLoggedIn, type MockFlags, type MockUser } from './mocks'

// Covers the usage detail page (/usage): reset date, signals per day, the
// per-feature breakdown, the credit ledger and the link from the quota meter.
// All network is mocked — no real backend/DB, per e2e/README.md.

const ENFORCED_WITH_PAYMENTS: MockFlags = {
  pricingTiersEnabled: true,
  enablePaymentProcessor: true,
}

const signInAs = async (
  page: Page,
  plan: MockUser['plan'],
  flags: MockFlags = ENFORCED_WITH_PAYMENTS,
): Promise<void> => {
  await mockLoggedIn(
    page,
    {
      userId: 'e2e-user-1',
      email: 'e2e-user@example.com',
      displayName: 'Alex Morgan',
      phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
      plan,
    },
    flags,
  )
  await page.route('**/api/v1/rbac/user-screens', (route) =>
    route.fulfill({
      status: 200,
      json: { data: { CORE_APP: { canRead: true } } },
    }),
  )
}

const day = (date: string, signals = 0, creditSpentPaisa = 0) => ({
  date,
  signals,
  creditSpentPaisa,
})

type HistoryOverrides = {
  plan?: 'FREE' | 'PRO' | 'TEAM'
  metered?: boolean
  scope?: 'USER' | 'TEAM' | null
  range?: 'current' | 'previous'
}

const history = (o: HistoryOverrides = {}) => ({
  success: true,
  data: {
    plan: o.plan ?? 'PRO',
    metered: o.metered ?? true,
    scope: o.scope === undefined ? 'USER' : o.scope,
    range: o.range ?? 'current',
    timezone: 'UTC',
    window:
      o.metered === false
        ? null
        : {
            start: '2030-09-10T12:00:00.000Z',
            end: '2030-10-10T12:00:00.000Z',
            source: 'SUBSCRIPTION_PERIOD',
          },
    totals: { signals: 7, creditSpentPaisa: 10_000 },
    daily:
      o.metered === false
        ? []
        : [
            day('2030-09-10', 5, 10_000),
            day('2030-09-11'),
            day('2030-09-12', 2),
          ],
    byFeature: [
      { feature: 'ai_forecast', signals: 5, creditSpentPaisa: 0 },
      { feature: 'ai_decision', signals: 2, creditSpentPaisa: 10_000 },
    ],
  },
})

const usage = {
  success: true,
  data: {
    plan: 'PRO',
    metered: true,
    quota: {
      limit: 300,
      used: 7,
      remaining: 293,
      windowStart: '2030-09-10T12:00:00.000Z',
      windowEnd: '2030-10-10T12:00:00.000Z',
      windowSource: 'SUBSCRIPTION_PERIOD',
    },
    credits: {
      pool: 'USER',
      balanceInPaisa: 95_000,
      costPerSignalPaisa: 5_000,
      signalsAvailable: 19,
      canTopUp: true,
    },
    spendCap: null,
  },
}

const mockPage = async (
  page: Page,
  o: HistoryOverrides = {},
): Promise<string[]> => {
  const requested: string[] = []
  await page.route('**/api/v1/payments/me/usage', (route) =>
    route.fulfill({ status: 200, json: usage }),
  )
  await page.route('**/api/v1/payments/me/usage/history*', (route) => {
    requested.push(route.request().url())
    const range = new URL(route.request().url()).searchParams.get('range')
    return route.fulfill({
      status: 200,
      json: history({
        ...o,
        range: range === 'previous' ? 'previous' : 'current',
      }),
    })
  })
  await page.route('**/api/v1/payments/credits/ledger*', (route) =>
    route.fulfill({
      status: 200,
      json: {
        success: true,
        data: {
          scope: o.scope ?? 'USER',
          balanceInPaisa: 95_000,
          entries: [
            {
              id: 'l1',
              amountPaisa: 100_000,
              type: 'PURCHASE',
              description: 'Credit top-up',
              createdAt: '2030-09-10T10:00:00.000Z',
              isTeamPool: false,
            },
          ],
          nextCursor: null,
        },
      },
    }),
  )
  return requested
}

test.describe('Usage page', () => {
  test('shows totals, the reset date, the per-day table, the feature split and the credit ledger', async ({
    page,
  }) => {
    await signInAs(page, 'PRO')
    await mockPage(page)

    await page.goto('/usage')

    await expect(page.getByRole('heading', { name: 'Usage' })).toBeVisible()
    await expect(page.getByTestId('history-signals')).toHaveText('7')
    await expect(page.getByTestId('history-credit-spend')).toHaveText('Rs 100')
    await expect(page.getByTestId('history-reset')).toContainText(
      'Resets Oct 10',
    )
    await expect(page.getByText('Your own usage')).toBeVisible()

    await page.getByText('View as table').click()
    const table = page.locator('details')
    await expect(table.getByRole('row')).toHaveCount(4) // header + 3 days
    await expect(table.getByRole('row', { name: /Sep 11/ })).toBeVisible()

    await expect(page.getByText('AI forecast')).toBeVisible()
    await expect(page.getByText(/2 signals · Rs 100 credits/)).toBeVisible()
    await expect(page.getByText('Credit top-up')).toBeVisible()
  })

  test('asks for daily buckets in the browser time zone', async ({ page }) => {
    await signInAs(page, 'PRO')
    const requested = await mockPage(page)

    await page.goto('/usage')
    await expect(page.getByTestId('history-signals')).toBeVisible()

    const params = new URL(requested[0]).searchParams
    expect(params.get('range')).toBe('current')
    expect(params.get('tz')).toBe(
      await page.evaluate(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
    )
  })

  test('switching to the previous cycle reloads and drops the reset note', async ({
    page,
  }) => {
    await signInAs(page, 'PRO')
    const requested = await mockPage(page)

    await page.goto('/usage')
    await expect(page.getByTestId('history-reset')).toBeVisible()

    await page.getByRole('button', { name: 'Previous cycle' }).click()

    await expect(page.getByTestId('history-reset')).toHaveCount(0)
    expect(requested.at(-1)).toContain('range=previous')
  })

  test('a workspace owner or admin sees the whole workspace', async ({
    page,
  }) => {
    await signInAs(page, 'TEAM')
    await mockPage(page, { plan: 'TEAM', scope: 'TEAM' })

    await page.goto('/usage')

    await expect(page.getByText('Everyone in your workspace')).toBeVisible()
  })

  test('a Free user is told there is no history', async ({ page }) => {
    await signInAs(page, 'FREE')
    await mockPage(page, { plan: 'FREE', metered: false, scope: null })

    await page.goto('/usage')

    await expect(page.getByText(/daily limits/)).toBeVisible()
    await expect(page.getByTestId('history-signals')).toHaveCount(0)
  })

  test('shows an error with a retry when the history cannot be loaded', async ({
    page,
  }) => {
    await signInAs(page, 'PRO')
    await mockPage(page)
    let fail = true
    await page.route('**/api/v1/payments/me/usage/history*', (route) => {
      if (fail) {
        fail = false
        return route.fulfill({ status: 500, json: { message: 'boom' } })
      }
      return route.fallback()
    })

    await page.goto('/usage')
    // The server's own message wins over the generic fallback.
    await expect(page.getByRole('alert')).toContainText('boom')

    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByTestId('history-signals')).toHaveText('7')
  })

  test('is reachable from the quota meter in Settings → Credits', async ({
    page,
  }) => {
    await signInAs(page, 'PRO')
    await mockPage(page)
    await page.route('**/api/v1/teams/preferences', (route) =>
      route.fulfill({
        status: 200,
        json: {
          success: true,
          data: { workspace: {}, personal: {}, effective: {} },
        },
      }),
    )

    await page.goto('/settings')
    await page.getByRole('button', { name: /Credits/ }).click()
    await page.getByRole('link', { name: 'Usage details' }).click()

    await expect(page).toHaveURL(/\/usage$/)
    await expect(page.getByTestId('history-signals')).toHaveText('7')
    // The page's own meter does not link back to itself.
    await expect(page.getByRole('link', { name: 'Usage details' })).toHaveCount(
      0,
    )
  })
})
