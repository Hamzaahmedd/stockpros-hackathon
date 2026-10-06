import { expect, test, type Page } from '@playwright/test'
import { mockLoggedIn, type MockFlags, type MockUser } from './mocks'

// Covers the "Email me before I hit a limit" switch on /usage.
// All network is mocked — no real backend/DB, per e2e/README.md.

const FLAGS: MockFlags = {
  pricingTiersEnabled: true,
  enablePaymentProcessor: true,
}

const signInAs = async (page: Page, plan: MockUser['plan']): Promise<void> => {
  await mockLoggedIn(
    page,
    {
      userId: 'e2e-user-1',
      email: 'e2e-user@example.com',
      displayName: 'Alex Morgan',
      phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
      plan,
    },
    FLAGS,
  )
  await page.route('**/api/v1/rbac/user-screens', (route) =>
    route.fulfill({
      status: 200,
      json: { data: { CORE_APP: { canRead: true } } },
    }),
  )
}

const usage = (alertsEnabled: boolean, canSetSpendCap = true) => ({
  success: true,
  data: {
    plan: 'PRO',
    metered: true,
    quota: {
      limit: 300,
      used: 12,
      remaining: 288,
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
      canSetSpendCap,
    },
    alertsEnabled,
    spendCap: null,
  },
})

const history = {
  success: true,
  data: {
    plan: 'PRO',
    metered: true,
    scope: 'USER',
    range: 'current',
    timezone: 'UTC',
    window: {
      start: '2030-09-10T12:00:00.000Z',
      end: '2030-10-10T12:00:00.000Z',
      source: 'SUBSCRIPTION_PERIOD',
    },
    totals: { signals: 0, creditSpentPaisa: 0 },
    daily: [{ date: '2030-09-10', signals: 0, creditSpentPaisa: 0 }],
    byFeature: [
      { feature: 'ai_forecast', signals: 0, creditSpentPaisa: 0 },
      { feature: 'ai_decision', signals: 0, creditSpentPaisa: 0 },
    ],
  },
}

const mockApi = async (page: Page, initial: boolean, canSetSpendCap = true) => {
  const state = { enabled: initial, putBodies: [] as unknown[] }
  await page.route('**/api/v1/payments/me/usage', (route) =>
    route.fulfill({
      status: 200,
      json: usage(state.enabled, canSetSpendCap),
    }),
  )
  await page.route('**/api/v1/payments/me/usage/history*', (route) =>
    route.fulfill({ status: 200, json: history }),
  )
  await page.route('**/api/v1/payments/credits/ledger*', (route) =>
    route.fulfill({
      status: 200,
      json: {
        success: true,
        data: {
          scope: 'USER',
          balanceInPaisa: 0,
          entries: [],
          nextCursor: null,
        },
      },
    }),
  )
  await page.route('**/api/v1/payments/usage-alerts', (route) => {
    const body = route.request().postDataJSON() as { enabled: boolean }
    state.putBodies.push(body)
    state.enabled = body.enabled
    return route.fulfill({ status: 200, json: usage(state.enabled) })
  })
  return state
}

const toggle = (page: Page) =>
  page.getByRole('switch', { name: 'Email me before I hit a limit' })

test.describe('Usage email alerts', () => {
  test('are on by default and can be turned off and on again', async ({
    page,
  }) => {
    await signInAs(page, 'PRO')
    const state = await mockApi(page, true)

    await page.goto('/usage')
    await expect(toggle(page)).toBeChecked()

    await toggle(page).click()
    await expect(toggle(page)).not.toBeChecked()

    await toggle(page).click()
    await expect(toggle(page)).toBeChecked()

    expect(state.putBodies).toEqual([{ enabled: false }, { enabled: true }])
  })

  test('shows the saved opt-out after a reload', async ({ page }) => {
    await signInAs(page, 'PRO')
    await mockApi(page, false)

    await page.goto('/usage')

    await expect(toggle(page)).not.toBeChecked()
  })

  test('a workspace member does not see it: they are not emailed yet', async ({
    page,
  }) => {
    await signInAs(page, 'TEAM')
    await mockApi(page, true, false)

    await page.goto('/usage')

    await expect(page.getByTestId('history-signals')).toBeVisible()
    await expect(toggle(page)).toHaveCount(0)
  })
})
