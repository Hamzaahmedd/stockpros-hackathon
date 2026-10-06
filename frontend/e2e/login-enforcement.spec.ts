import { expect, test, type Page, type Route } from '@playwright/test'
import { mockLoggedIn, mockLoggedOut } from './mocks'

// Login enforcement: per-domain sign-in policy on the login screen, the owner's
// Security tab and the staff reset. All network is mocked — no real backend/DB,
// per e2e/README.md.

type Role = 'OWNER' | 'ADMIN' | 'MEMBER'

const REASON = 'Owner locked out, verified by phone, SUP-77'
const GOOGLE_REQUIRED = 'Your organization requires signing in with Google'

const ok = (route: Route, data: unknown = undefined) =>
  route.fulfill({ status: 200, json: { success: true, message: 'ok', data } })

const mockLoginOptions = (page: Page, authPolicy: string) =>
  page.route('**/api/v1/auth/login-options', (route) =>
    ok(route, { authPolicy }),
  )

const refuseLoginMethod = (route: Route) =>
  route.fulfill({
    status: 403,
    json: {
      success: false,
      message: GOOGLE_REQUIRED,
      statusCode: 403,
      errorCode: 'LOGIN_METHOD_REQUIRED',
    },
  })

test.describe('login screen', () => {
  test('a Google-only domain shows the notice and disables the magic-link button', async ({
    page,
  }) => {
    await mockLoggedOut(page)
    await mockLoginOptions(page, 'GOOGLE_ONLY')
    await page.goto('/login')

    const submit = page.getByRole('button', { name: /continue with email/i })
    await expect(submit).toBeEnabled()

    await page.getByLabel('Email Address').fill('pat@fund.com')
    await expect(page.getByRole('alert')).toContainText(GOOGLE_REQUIRED)
    await expect(submit).toBeDisabled()

    await mockLoginOptions(page, 'ANY')
    await page.getByLabel('Email Address').fill('pat@other.com')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(submit).toBeEnabled()
  })

  test('a Workspace domain mentions the company Google Workspace account', async ({
    page,
  }) => {
    await mockLoggedOut(page)
    await mockLoginOptions(page, 'GOOGLE_WORKSPACE')
    await page.goto('/login')

    await page.getByLabel('Email Address').fill('pat@fund.com')
    await expect(page.getByRole('alert')).toContainText('Google Workspace')
  })

  test('a refused magic-link request shows the server message cleanly', async ({
    page,
  }) => {
    await mockLoggedOut(page)
    await mockLoginOptions(page, 'ANY')
    await page.route('**/api/v1/auth/magic-link', refuseLoginMethod)
    await page.goto('/login')

    await page.getByLabel('Email Address').fill('pat@fund.com')
    await page.getByRole('button', { name: /continue with email/i }).click()

    await expect(page.getByRole('alert')).toContainText(GOOGLE_REQUIRED)
    await expect(
      page.getByRole('button', { name: /continue with email/i }),
    ).toBeDisabled()
  })

  test('a refused magic-link verification points back to Google sign-in', async ({
    page,
  }) => {
    await mockLoggedOut(page)
    await page.route('**/api/v1/auth/verify-magic-link', refuseLoginMethod)
    await page.goto('/auth/verify?token=abc123')

    await expect(page.getByText(GOOGLE_REQUIRED)).toBeVisible()
    await page.getByRole('button', { name: 'Sign in with Google' }).click()
    await expect(page).toHaveURL(/\/login/)
  })
})

const DOMAIN = {
  id: 'd-1',
  domain: 'fund.com',
  isVerified: true,
  restrictOrgCreation: true,
  joinPolicy: 'INVITE_ONLY',
  authPolicy: 'ANY',
}

const workspace = (
  role: Role,
  firstDomain: Record<string, unknown> = DOMAIN,
) => ({
  id: 'team-1',
  name: 'Alpha Fund',
  status: 'ACTIVE',
  role,
  seats: {
    capacity: 6,
    scheduledCapacity: null,
    active: 3,
    pendingInvites: 0,
    available: 3,
  },
  creditBalanceInPaisa: 100_000,
  orgInstructions: null,
  billingEmail: null,
  domains: [
    firstDomain,
    { ...DOMAIN, id: 'd-2', domain: 'pending.com', isVerified: false },
  ],
  subscription: null,
})

const openWorkspace = async (
  page: Page,
  role: Role,
  firstDomain: Record<string, unknown> = DOMAIN,
) => {
  await mockLoggedIn(page, {
    userId: 'e2e-user-1',
    email: 'alex@fund.com',
    displayName: 'Alex Morgan',
    phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
    plan: 'TEAM',
  })
  await page.route('**/api/v1/rbac/user-screens', (route) =>
    route.fulfill({
      status: 200,
      json: { data: { CORE_APP: { canRead: true } } },
    }),
  )
  await page.route('**/api/v1/teams/me', (route) =>
    ok(route, workspace(role, firstDomain)),
  )
  await page.route('**/api/v1/teams/members', (route) => ok(route, []))
  await page.route('**/api/v1/teams/invites', (route) => ok(route, []))
  await page.route('**/api/v1/payments/me/usage', (route) =>
    route.fulfill({ status: 404, json: { success: false } }),
  )
  await page.goto('/teams')
  await expect(page.getByRole('heading', { name: 'Alpha Fund' })).toBeVisible()
}

test.describe('workspace security tab', () => {
  test('the owner requires Google sign-in only after typing the domain', async ({
    page,
  }) => {
    await openWorkspace(page, 'OWNER')
    let body: unknown
    await page.route(
      '**/api/v1/teams/domains/fund.com/auth-policy',
      (route) => {
        body = route.request().postDataJSON()
        return ok(route, {
          ...DOMAIN,
          authPolicy: 'GOOGLE_ONLY',
          revokedSessions: 4,
        })
      },
    )

    await page.getByRole('tab', { name: 'Security' }).click()
    await expect(
      page.getByLabel('Sign-in method for pending.com'),
    ).toBeDisabled()
    await page
      .getByLabel('Sign-in method for fund.com')
      .selectOption('GOOGLE_ONLY')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('signed in with Google yourself')
    const confirm = dialog.getByRole('button', { name: 'Confirm' })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Type fund.com to confirm').fill('fund.co')
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Type fund.com to confirm').fill('fund.com')
    await confirm.click()

    await expect
      .poll(() => body)
      .toEqual({ authPolicy: 'GOOGLE_ONLY', confirmDomain: 'fund.com' })
    await expect(page.getByText('4 sessions were signed out')).toBeVisible()
  })

  test('a server refusal (owner not signed in with Google) is shown', async ({
    page,
  }) => {
    await openWorkspace(page, 'OWNER')
    const message =
      'Sign in with Google yourself before requiring it for your domain'
    await page.route('**/api/v1/teams/domains/fund.com/auth-policy', (route) =>
      route.fulfill({
        status: 409,
        json: { success: false, message, statusCode: 409 },
      }),
    )

    await page.getByRole('tab', { name: 'Security' }).click()
    await page
      .getByLabel('Sign-in method for fund.com')
      .selectOption('GOOGLE_WORKSPACE')
    await page.getByLabel('Type fund.com to confirm').fill('fund.com')
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirm' })
      .click()

    await expect(page.getByText(message)).toBeVisible()
  })

  test('going back to any method needs no typed confirmation', async ({
    page,
  }) => {
    await openWorkspace(page, 'OWNER', { ...DOMAIN, authPolicy: 'GOOGLE_ONLY' })
    let body: unknown
    await page.route(
      '**/api/v1/teams/domains/fund.com/auth-policy',
      (route) => {
        body = route.request().postDataJSON()
        return ok(route, { ...DOMAIN, revokedSessions: 0 })
      },
    )

    await page.getByRole('tab', { name: 'Security' }).click()
    await page.getByLabel('Sign-in method for fund.com').selectOption('ANY')
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirm' })
      .click()

    await expect.poll(() => body).toEqual({ authPolicy: 'ANY' })
  })

  for (const role of ['ADMIN', 'MEMBER'] as const) {
    test(`the ${role} role does not see the Security tab`, async ({ page }) => {
      await openWorkspace(page, role)
      await expect(page.getByRole('tab', { name: 'Domains' })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Security' })).toHaveCount(0)
    })
  }
})

test.describe('staff panel', () => {
  test('a platform admin resets a domain auth policy with an audited reason', async ({
    page,
  }) => {
    await mockLoggedIn(
      page,
      {
        userId: 'staff-1',
        email: 'staff@venturedive.com',
        displayName: 'Staff Member',
        phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
        platformRole: 'PLATFORM_ADMIN',
      },
      { pricingTiersEnabled: true },
    )
    await page.route('**/api/v1/rbac/user-screens', (route) =>
      route.fulfill({
        status: 200,
        json: { data: { CORE_APP: { canRead: true } } },
      }),
    )
    await page.route('**/api/v1/admin/teams/search**', (route) =>
      ok(route, [
        {
          id: 'team-1',
          name: 'Alpha Fund',
          status: 'ACTIVE',
          seatCapacity: 6,
          scheduledSeatCapacity: null,
          effectiveSeatCapacity: 6,
          seatsUsed: 3,
          seatUtilization: '3/6',
          piiMasked: false,
          orgInstructions: null,
          creditBalanceInPaisa: 0,
          owner: {
            id: 'u-1',
            displayName: 'Alex Morgan',
            email: 'alex@fund.com',
          },
          domains: [
            {
              id: 'd-1',
              domain: 'fund.com',
              isVerified: true,
              authPolicy: 'GOOGLE_ONLY',
            },
            {
              id: 'd-2',
              domain: 'open.com',
              isVerified: true,
              authPolicy: 'ANY',
            },
          ],
          members: [],
          subscription: null,
        },
      ]),
    )
    let path = ''
    let body: unknown
    await page.route(
      '**/api/v1/admin/teams/domains/*/reset-auth-policy',
      (route) => {
        path = new URL(route.request().url()).pathname
        body = route.request().postDataJSON()
        return ok(route, {
          domain: 'fund.com',
          authPolicy: 'ANY',
          teamId: 'team-1',
        })
      },
    )

    await page.goto('/admin')
    await page.getByRole('tab', { name: 'Team workspaces' }).click()
    await page.getByLabel('Search teams').fill('alpha')
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page.getByText('fund.com', { exact: true })).toBeVisible()
    // Only the restricted domain offers the reset.
    await expect(
      page.getByRole('button', { name: 'Reset auth policy to ANY' }),
    ).toHaveCount(1)

    await page.getByRole('button', { name: 'Reset auth policy to ANY' }).click()
    await page.getByLabel('Reason (audited)').fill(REASON)
    await page.getByLabel('Support ticket').fill('SUP-77')
    await page.getByRole('button', { name: 'Reset to ANY' }).click()

    await expect
      .poll(() => body)
      .toEqual({ reason: REASON, ticketRef: 'SUP-77' })
    expect(path).toBe('/api/v1/admin/teams/domains/fund.com/reset-auth-policy')
    await expect(page.getByText('Auth policy reset to ANY')).toBeVisible()
  })
})
