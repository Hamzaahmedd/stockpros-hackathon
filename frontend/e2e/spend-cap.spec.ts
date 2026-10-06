import { expect, test, type Page } from '@playwright/test'
import { mockLoggedIn, type MockFlags, type MockUser } from './mocks'

// Covers the personal monthly spending limit on /usage: setting, changing and
// removing it, who can see the control, and what happens when it stops a signal.
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

type Cap = { monthlyLimitPaisa: number; spentPaisa: number } | null

const usage = (cap: Cap, canSetSpendCap = true) => ({
  success: true,
  data: {
    plan: 'PRO',
    metered: true,
    quota: {
      limit: 300,
      used: 300,
      remaining: 0,
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
    alertsEnabled: true,
    spendCap: cap && {
      ...cap,
      remainingPaisa: Math.max(cap.monthlyLimitPaisa - cap.spentPaisa, 0),
    },
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

/** Mocks the usage endpoints; `current` is what GET /me/usage returns and PUT updates it. */
const mockUsageApi = async (
  page: Page,
  initial: Cap,
  canSetSpendCap = true,
) => {
  const state = { cap: initial, putBodies: [] as unknown[] }
  await page.route('**/api/v1/payments/me/usage', (route) =>
    route.fulfill({ status: 200, json: usage(state.cap, canSetSpendCap) }),
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
          balanceInPaisa: 95_000,
          entries: [],
          nextCursor: null,
        },
      },
    }),
  )
  await page.route('**/api/v1/payments/credits/spend-cap', (route) => {
    const body = route.request().postDataJSON() as {
      monthlyLimitPaisa: number | null
    }
    state.putBodies.push(body)
    state.cap =
      body.monthlyLimitPaisa === null
        ? null
        : { monthlyLimitPaisa: body.monthlyLimitPaisa, spentPaisa: 0 }
    return route.fulfill({ status: 200, json: usage(state.cap) })
  })
  return state
}

const control = (page: Page) =>
  page.getByRole('region', { name: 'Monthly spending limit' })

test.describe('Personal spending limit', () => {
  test('a Pro user sets a limit in rupees and sees it applied', async ({
    page,
  }) => {
    await signInAs(page, 'PRO')
    const state = await mockUsageApi(page, null)

    await page.goto('/usage')
    await control(page)
      .getByLabel(/Limit per cycle/)
      .fill('500')
    await control(page).getByRole('button', { name: 'Save limit' }).click()

    await expect(control(page).getByTestId('spend-cap-status')).toContainText(
      'Rs 0 of Rs 500 used this cycle (Rs 500 left).',
    )
    expect(state.putBodies).toEqual([{ monthlyLimitPaisa: 50_000 }])
    // The meter above reloaded and now reports the limit too.
    await expect(page.getByTestId('spend-cap')).toContainText('Rs 500')
  })

  test('removing the limit sends null and clears it', async ({ page }) => {
    await signInAs(page, 'PRO')
    const state = await mockUsageApi(page, {
      monthlyLimitPaisa: 20_000,
      spentPaisa: 5_000,
    })

    await page.goto('/usage')
    await expect(control(page).getByTestId('spend-cap-status')).toContainText(
      'Rs 50 of Rs 200 used',
    )
    await control(page).getByRole('button', { name: 'Remove limit' }).click()

    await expect(control(page).getByTestId('spend-cap-status')).toHaveCount(0)
    await expect(control(page).getByLabel(/Limit per cycle/)).toHaveValue('')
    expect(state.putBodies).toEqual([{ monthlyLimitPaisa: null }])
  })

  test('an amount outside the allowed range is refused without calling the API', async ({
    page,
  }) => {
    await signInAs(page, 'PRO')
    const state = await mockUsageApi(page, null)

    await page.goto('/usage')
    await control(page)
      .getByLabel(/Limit per cycle/)
      .fill('10')
    await control(page).getByRole('button', { name: 'Save limit' }).click()

    await expect(control(page).getByRole('alert')).toContainText(
      'Enter an amount between Rs 50 and Rs 100,000.',
    )
    expect(state.putBodies).toEqual([])
  })

  test('says so when the limit has been reached', async ({ page }) => {
    await signInAs(page, 'PRO')
    await mockUsageApi(page, { monthlyLimitPaisa: 20_000, spentPaisa: 20_000 })

    await page.goto('/usage')

    await expect(control(page).getByRole('status')).toContainText(
      'paid AI signals are paused',
    )
  })

  test('a workspace member sees no control: their admin sets the limit', async ({
    page,
  }) => {
    await signInAs(page, 'TEAM')
    await mockUsageApi(page, null, false)

    await page.goto('/usage')

    await expect(page.getByTestId('history-signals')).toBeVisible()
    await expect(control(page)).toHaveCount(0)
  })

  test('when the limit stops a signal, the dialog points to the usage page instead of selling credit', async ({
    page,
  }) => {
    await signInAs(page, 'PRO')
    await mockUsageApi(page, { monthlyLimitPaisa: 20_000, spentPaisa: 20_000 })
    await page.route('**/api/v1/decision-support/market/radar*', (route) =>
      route.fulfill({
        status: 403,
        json: {
          success: false,
          message: 'Quota exhausted',
          errorCode: 'OVERAGE_REQUIRED',
          details: {
            code: 'OVERAGE_REQUIRED',
            reason: 'PERSONAL_SPEND_LIMIT_REACHED',
            feature: 'ai_decision',
            canTopUp: true,
          },
        },
      }),
    )

    await page.goto('/decision-support/radar')

    const dialog = page.getByRole('dialog', { name: 'Spending limit reached' })
    await expect(dialog).toContainText(
      'the monthly credit spending limit you set',
    )
    await expect(page.getByRole('button', { name: /Rs 500/ })).toHaveCount(0)

    await dialog.getByRole('link', { name: 'Review your limit' }).click()
    await expect(page).toHaveURL(/\/usage$/)
    await expect(control(page)).toBeVisible()
  })
})
