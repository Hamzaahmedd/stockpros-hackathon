import { expect, test, type Page } from '@playwright/test'
import { mockLoggedIn, type MockFlags } from './mocks'

// Untrusted values are checked at runtime, not cast: localStorage contents,
// window events, API error/response bodies and user-typed JSON. Each test
// feeds the app something hostile or malformed and asserts it degrades safely.
// All network is mocked — no real backend/DB, per e2e/README.md.

const FLAGS: MockFlags = {
  pricingTiersEnabled: true,
  enablePaymentProcessor: true,
}

const signIn = async (
  page: Page,
  plan: 'PRO' | 'TEAM' = 'PRO',
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
    FLAGS,
  )
  await page.route('**/api/v1/rbac/user-screens', (route) =>
    route.fulfill({
      status: 200,
      json: { data: { CORE_APP: { canRead: true } } },
    }),
  )
}

const STORAGE_KEY = 'pending_invite_token'

// ─── stored invite record (localStorage) ─────────────────────────────────────

test.describe('a corrupt stored invite record is ignored and cleaned up', () => {
  const bad: [string, string][] = [
    ['not JSON at all', 'definitely not json'],
    ['JSON null', 'null'],
    ['a JSON string', '"just-a-string"'],
    ['a JSON array', '[]'],
    [
      'a token of the wrong type',
      JSON.stringify({ token: 123, expiresAt: Date.now() + 60_000 }),
    ],
    [
      'an expiry of the wrong type',
      JSON.stringify({ token: 'abc', expiresAt: 'tomorrow' }),
    ],
    ['a missing expiry', JSON.stringify({ token: 'abc' })],
    ['a missing token', JSON.stringify({ expiresAt: Date.now() + 60_000 })],
    [
      'an expired record',
      JSON.stringify({ token: 'abc', expiresAt: Date.now() - 1_000 }),
    ],
  ]

  for (const [label, raw] of bad) {
    test(label, async ({ page }) => {
      await signIn(page)
      await page.addInitScript(
        ([key, value]) => localStorage.setItem(key, value),
        [STORAGE_KEY, raw],
      )
      let accepted = 0
      await page.route('**/api/v1/teams/invites/accept', (route) => {
        accepted += 1
        return route.fulfill({ status: 200, json: { success: true, data: {} } })
      })

      await page.goto('/dashboard')

      await expect(page).toHaveURL(/\/dashboard$/)
      expect(accepted).toBe(0)
      expect(
        await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
      ).toBeNull()
    })
  }
})

// ─── overage window events ───────────────────────────────────────────────────

test.describe('the top-up dialog only reacts to a well-formed overage event', () => {
  const dispatch = (page: Page, detail: unknown) =>
    page.evaluate(
      (d) =>
        window.dispatchEvent(
          new CustomEvent('stockpros:overage-required', { detail: d }),
        ),
      detail,
    )

  test('malformed details are ignored; a valid one opens the dialog', async ({
    page,
  }) => {
    await signIn(page)
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
    await expect(page.getByText('Display preferences')).toBeVisible()
    const dialog = page.getByRole('dialog', { name: 'Top up credits' })

    const malformed: unknown[] = [
      null,
      'OVERAGE_REQUIRED',
      42,
      [],
      {},
      { code: 'OVERAGE_REQUIRED' },
      {
        code: 'SOMETHING_ELSE',
        reason: 'INSUFFICIENT_CREDITS',
        feature: 'f',
        canTopUp: true,
      },
      {
        code: 'OVERAGE_REQUIRED',
        reason: 'MADE_UP',
        feature: 'f',
        canTopUp: true,
      },
      {
        code: 'OVERAGE_REQUIRED',
        reason: 'INSUFFICIENT_CREDITS',
        feature: 7,
        canTopUp: true,
      },
      {
        code: 'OVERAGE_REQUIRED',
        reason: 'INSUFFICIENT_CREDITS',
        feature: 'f',
        canTopUp: 'yes',
      },
    ]
    for (const detail of malformed) await dispatch(page, detail)
    // A plain (non-Custom) event of the same name carries no detail at all.
    await page.evaluate(() =>
      window.dispatchEvent(new Event('stockpros:overage-required')),
    )
    await expect(dialog).toHaveCount(0)

    await dispatch(page, {
      code: 'OVERAGE_REQUIRED',
      reason: 'SPEND_LIMIT_REACHED',
      feature: 'ai_forecast',
      canTopUp: true,
    })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('monthly credit spending limit')
  })
})

// ─── API error bodies ────────────────────────────────────────────────────────

test.describe('hostile or odd API error bodies never crash the client', () => {
  const radarFails = (
    page: Page,
    status: number,
    body: unknown,
    contentType = 'application/json',
  ) =>
    page.route('**/api/v1/decision-support/market/radar*', (route) =>
      route.fulfill({
        status,
        contentType,
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    )

  const errors = async (page: Page) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    return pageErrors
  }

  test("an HTML error page (e.g. a proxy 502) just yields the page's own failure message", async ({
    page,
  }) => {
    await signIn(page)
    const pageErrors = await errors(page)
    await radarFails(
      page,
      502,
      '<html><body>Bad gateway</body></html>',
      'text/html',
    )

    await page.goto('/decision-support/radar')

    await expect(
      page.getByText('Failed to load Opportunity Radar data'),
    ).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(pageErrors).toEqual([])
  })

  for (const [label, body] of [
    ['an array body', []],
    ['a null body', null],
    ['a numeric errorCode', { errorCode: 5, message: 'weird' }],
    [
      'a non-string message',
      { errorCode: 'Whatever', message: { nested: true } },
    ],
  ] as const) {
    test(`tolerates ${label}`, async ({ page }) => {
      await signIn(page)
      const pageErrors = await errors(page)
      await radarFails(page, 500, body)

      await page.goto('/decision-support/radar')

      await expect(
        page.getByText('Failed to load Opportunity Radar data'),
      ).toBeVisible()
      expect(pageErrors).toEqual([])
    })
  }

  test("OVERAGE_REQUIRED without usable details falls back to 'ask an admin', no dialog", async ({
    page,
  }) => {
    await signIn(page)
    await radarFails(page, 403, {
      errorCode: 'OVERAGE_REQUIRED',
      message: 'Quota exhausted',
    })

    await page.goto('/decision-support/radar')

    await expect(
      page.getByText(/credits are used up — ask a workspace admin/),
    ).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('OVERAGE_REQUIRED with mistyped details (canTopUp is a string) is not trusted', async ({
    page,
  }) => {
    await signIn(page)
    await radarFails(page, 403, {
      errorCode: 'OVERAGE_REQUIRED',
      details: {
        code: 'OVERAGE_REQUIRED',
        reason: 'INSUFFICIENT_CREDITS',
        feature: 'f',
        canTopUp: 'yes',
      },
    })

    await page.goto('/decision-support/radar')

    await expect(
      page.getByText(/credits are used up — ask a workspace admin/),
    ).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('a well-formed OVERAGE_REQUIRED still opens the dialog', async ({
    page,
  }) => {
    await signIn(page)
    await radarFails(page, 403, {
      errorCode: 'OVERAGE_REQUIRED',
      details: {
        code: 'OVERAGE_REQUIRED',
        reason: 'INSUFFICIENT_CREDITS',
        feature: 'ai_decision',
        canTopUp: true,
      },
    })

    await page.goto('/decision-support/radar')

    await expect(
      page.getByRole('dialog', { name: 'Top up credits' }),
    ).toBeVisible()
  })

  test("plan-gating errors keep their upsell toast, using the server's message", async ({
    page,
  }) => {
    await signIn(page)
    await radarFails(page, 403, {
      errorCode: 'PlanRequiredError',
      message: 'Radar needs Pro',
    })

    await page.goto('/decision-support/radar')

    await expect(
      page.getByText('Radar needs Pro — visit Plans to upgrade to Pro'),
    ).toBeVisible()
  })

  test('a plan-gating error without a message uses the default wording', async ({
    page,
  }) => {
    await signIn(page)
    await radarFails(page, 403, { errorCode: 'QuotaExceededError' })

    await page.goto('/decision-support/radar')

    await expect(
      page.getByText(
        'This requires a Pro plan — visit Plans to upgrade to Pro',
      ),
    ).toBeVisible()
  })
})

// ─── orgContext in responses ─────────────────────────────────────────────────

test.describe('orgContext is only shown when it is a real, non-blank string', () => {
  for (const [label, orgContext] of [
    ['a number', 42],
    ['an array', ['a', 'b']],
    ['an object', { text: 'hi' }],
    ['null', null],
    ['blank', '   '],
    ['an empty string', ''],
  ] as const) {
    test(`ignores ${label}`, async ({ page }) => {
      await signIn(page, 'TEAM')
      await page.route('**/api/v1/decision-support/market/radar*', (route) =>
        route.fulfill({
          status: 200,
          json: { success: true, data: [], orgContext },
        }),
      )

      await page.goto('/decision-support/radar')

      await expect(
        page.getByRole('heading', { name: 'AI Opportunity Radar' }),
      ).toBeVisible()
      await expect(
        page.getByRole('complementary', { name: 'Workspace guidance' }),
      ).toHaveCount(0)
    })
  }

  test('shows a valid string', async ({ page }) => {
    await signIn(page, 'TEAM')
    await page.route('**/api/v1/decision-support/market/radar*', (route) =>
      route.fulfill({
        status: 200,
        json: {
          success: true,
          data: [],
          orgContext: 'Prefer dividend growers.',
        },
      }),
    )

    await page.goto('/decision-support/radar')

    await expect(
      page.getByRole('complementary', { name: 'Workspace guidance' }),
    ).toContainText('Prefer dividend growers.')
  })
})

// ─── user-typed JSON (screener criteria) ─────────────────────────────────────

test.describe('screener criteria must be a JSON object', () => {
  const open = async (page: Page) => {
    await signIn(page, 'TEAM')
    await page.route('**/api/v1/teams/me', (route) =>
      route.fulfill({
        status: 200,
        json: {
          success: true,
          data: {
            id: 'team-1',
            name: 'Alpha Fund',
            status: 'ACTIVE',
            role: 'MEMBER',
            seats: { capacity: 5, active: 2, pendingInvites: 0, available: 3 },
            creditBalanceInPaisa: 0,
            orgInstructions: null,
            domains: [],
            subscription: null,
          },
        },
      }),
    )
    await page.route('**/api/v1/teams/watchlists', (route) =>
      route.fulfill({ status: 200, json: { success: true, data: [] } }),
    )
    await page.route('**/api/v1/teams/screeners', (route) => {
      if (route.request().method() === 'POST') {
        posted.push(route.request().postDataJSON())
        return route.fulfill({ status: 201, json: { success: true, data: {} } })
      }
      return route.fulfill({ status: 200, json: { success: true, data: [] } })
    })
    await page.goto('/teams')
    await page.getByRole('tab', { name: 'Shared assets' }).click()
    await page.getByRole('tab', { name: 'Screeners' }).click()
  }
  const posted: unknown[] = []
  test.beforeEach(() => {
    posted.length = 0
  })

  const submit = async (page: Page, criteria: string) => {
    await page.getByLabel('Screener name').fill('Value')
    await page.getByLabel('Screener criteria (JSON)').fill(criteria)
    await page.getByRole('button', { name: 'Share screener preset' }).click()
  }

  for (const [label, criteria, message] of [
    ['an array', '[1, 2]', 'Criteria must be a JSON object'],
    ['a string', '"x"', 'Criteria must be a JSON object'],
    ['null', 'null', 'Criteria must be a JSON object'],
    ['a number', '42', 'Criteria must be a JSON object'],
    ['a boolean', 'true', 'Criteria must be a JSON object'],
    ['invalid JSON', '{ nope', 'Criteria must be valid JSON'],
    ['an empty box', '', 'Criteria must be valid JSON'],
  ] as const) {
    test(`rejects ${label} without calling the API`, async ({ page }) => {
      await open(page)
      await submit(page, criteria)

      await expect(page.getByText(message)).toBeVisible()
      expect(posted).toHaveLength(0)
    })
  }

  test('sends a valid nested object exactly as typed', async ({ page }) => {
    await open(page)
    await submit(
      page,
      '{"minMarketCap": 1000000000, "sectors": ["Tech"], "flags": {"dividend": true}}',
    )

    await expect.poll(() => posted.length).toBe(1)
    expect(posted[0]).toEqual({
      name: 'Value',
      criteria: {
        minMarketCap: 1000000000,
        sectors: ['Tech'],
        flags: { dividend: true },
      },
    })
  })
})

// ─── error messages from failed saves ────────────────────────────────────────

test.describe("save failures show the server's message when there is one, a fallback when there isn't", () => {
  const open = async (
    page: Page,
    patchResponse: { status: number; body: string; contentType: string },
  ) => {
    await signIn(page, 'TEAM')
    await page.route('**/api/v1/teams/me', (route) =>
      route.fulfill({
        status: 200,
        json: {
          success: true,
          data: {
            id: 'team-1',
            name: 'Alpha Fund',
            status: 'ACTIVE',
            role: 'MEMBER',
            seats: { capacity: 5, active: 2, pendingInvites: 0, available: 3 },
            creditBalanceInPaisa: 0,
            orgInstructions: null,
            domains: [],
            subscription: null,
          },
        },
      }),
    )
    await page.route('**/api/v1/teams/preferences', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: patchResponse.status,
            contentType: patchResponse.contentType,
            body: patchResponse.body,
          })
        : route.fulfill({
            status: 200,
            json: {
              success: true,
              data: { workspace: {}, personal: {}, effective: {} },
            },
          }),
    )
    await page.goto('/teams')
    await page.getByRole('tab', { name: 'Preferences' }).click()
    const form = page.getByRole('form', { name: 'personal preferences' })
    await form.getByLabel('Theme').selectOption('DARK')
    await form.getByRole('button', { name: 'Save preferences' }).click()
  }

  test("a JSON error body's message is shown", async ({ page }) => {
    await open(page, {
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        message: 'Theme is locked by your admin',
      }),
    })
    await expect(page.getByText('Theme is locked by your admin')).toBeVisible()
  })

  test('a non-JSON error body falls back to the generic message', async ({
    page,
  }) => {
    await open(page, {
      status: 500,
      contentType: 'text/plain',
      body: 'Internal Server Error',
    })
    await expect(page.getByText('Failed to save preferences')).toBeVisible()
  })

  test('a JSON body without a usable message falls back too', async ({
    page,
  }) => {
    await open(page, {
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 123 }),
    })
    await expect(page.getByText('Failed to save preferences')).toBeVisible()
  })
})

// ─── response structure ──────────────────────────────────────────────────────

test.describe('a response that is not the expected envelope cannot blank the page', () => {
  const openShared = async (
    page: Page,
    watchlists: { contentType: string; body: string },
  ) => {
    await signIn(page, 'TEAM')
    await page.route('**/api/v1/teams/me', (route) =>
      route.fulfill({
        status: 200,
        json: {
          success: true,
          data: {
            id: 'team-1',
            name: 'Alpha Fund',
            status: 'ACTIVE',
            role: 'MEMBER',
            seats: { capacity: 5, active: 2, pendingInvites: 0, available: 3 },
            creditBalanceInPaisa: 0,
            orgInstructions: null,
            domains: [],
            subscription: null,
          },
        },
      }),
    )
    await page.route('**/api/v1/teams/watchlists', (route) =>
      route.fulfill({
        status: 200,
        contentType: watchlists.contentType,
        body: watchlists.body,
      }),
    )
    await page.route('**/api/v1/teams/screeners', (route) =>
      route.fulfill({ status: 200, json: { success: true, data: [] } }),
    )
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto('/teams')
    await page.getByRole('tab', { name: 'Shared assets' }).click()
    return pageErrors
  }

  test('an HTML page returned with 200 (SPA fallback / proxy) shows a load error, and the UI keeps working', async ({
    page,
  }) => {
    const pageErrors = await openShared(page, {
      contentType: 'text/html',
      body: '<!doctype html><html><body>app shell</body></html>',
    })

    await expect(page.getByText('Failed to load')).toBeVisible()
    // The tab bar survived, so the user can still move around.
    await page.getByRole('tab', { name: 'Screeners' }).click()
    await expect(page.getByText('No screener presets yet.')).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  for (const [label, body] of [
    ['data: null', { success: true, data: null }],
    ['data: a string', { success: true, data: 'oops' }],
    ['data: an object instead of a list', { success: true, data: { id: 1 } }],
  ] as const) {
    test(`a list endpoint answering with ${label} renders as an empty list, not a crash`, async ({
      page,
    }) => {
      const pageErrors = await openShared(page, {
        contentType: 'application/json',
        body: JSON.stringify(body),
      })

      await expect(page.getByText('No shared watchlists yet.')).toBeVisible()
      expect(pageErrors).toEqual([])
    })
  }

  test('a JSON body with no data field is reported as an error, not rendered', async ({
    page,
  }) => {
    const pageErrors = await openShared(page, {
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })

    await expect(page.getByText('Failed to load')).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  test('the workspace page reports an unusable response instead of rendering it', async ({
    page,
  }) => {
    await signIn(page, 'TEAM')
    await page.route('**/api/v1/teams/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html>shell</html>',
      }),
    )

    await page.goto('/teams')

    await expect(page.getByText('Failed to load workspace')).toBeVisible()
  })
})

test.describe('a checkout response is only followed if it is a real http(s) redirect', () => {
  const openTopUp = async (page: Page, checkoutBody: unknown) => {
    await signIn(page)
    await page.route('**/api/v1/teams/preferences', (route) =>
      route.fulfill({
        status: 200,
        json: {
          success: true,
          data: { workspace: {}, personal: {}, effective: {} },
        },
      }),
    )
    await page.route('**/api/v1/payments/create-checkout', (route) =>
      route.fulfill({ status: 200, json: checkoutBody }),
    )
    await page.goto('/settings')
    await expect(page.getByText('Display preferences')).toBeVisible()
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('stockpros:overage-required', {
          detail: {
            code: 'OVERAGE_REQUIRED',
            reason: 'INSUFFICIENT_CREDITS',
            feature: 'ai_forecast',
            canTopUp: true,
          },
        }),
      ),
    )
    const dialog = page.getByRole('dialog', { name: 'Top up credits' })
    await dialog.getByRole('button', { name: /Rs 500/ }).click()
    return dialog
  }

  for (const [label, checkoutUrl] of [
    ['a javascript: URL', 'javascript:alert(document.cookie)'],
    ['a data: URL', 'data:text/html,<script>alert(1)</script>'],
    ['a protocol-relative URL', '//evil.example/pay'],
    ['a relative path', '/plans/result'],
    ['a non-string URL', 12345],
  ] as const) {
    test(`refuses ${label} and stays on the page`, async ({ page }) => {
      const dialog = await openTopUp(page, {
        success: true,
        checkoutUrl,
        trackerId: 'trk-1',
      })

      await expect(page.getByText('Failed to start checkout')).toBeVisible()
      await expect(page).toHaveURL(/\/settings$/)
      // The dialog stays usable: the pack buttons are enabled again for a retry.
      await expect(dialog.getByRole('button', { name: /Rs 500/ })).toBeEnabled()
    })
  }

  test('refuses a response with no tracker id', async ({ page }) => {
    await openTopUp(page, {
      success: true,
      checkoutUrl: 'https://pay.example/checkout',
    })

    await expect(page.getByText('Failed to start checkout')).toBeVisible()
    await expect(page).toHaveURL(/\/settings$/)
  })

  test('follows a well-formed https redirect', async ({ page }) => {
    await page.route('https://pay.example/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html>pay</html>',
      }),
    )
    await openTopUp(page, {
      success: true,
      checkoutUrl: 'https://pay.example/checkout?t=1',
      trackerId: 'trk-1',
    })

    await expect(page).toHaveURL('https://pay.example/checkout?t=1')
  })
})
