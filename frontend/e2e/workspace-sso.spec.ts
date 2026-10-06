import { expect, test, type Page, type Route } from '@playwright/test'
import { mockLoggedIn } from './mocks'

// Single sign-on setup in the workspace Security tab, and the staff tools for
// it. All network is mocked (including the identity provider) — no real
// backend/DB/IdP, per e2e/README.md.

const ok = (route: Route, data: unknown = undefined) =>
  route.fulfill({ status: 200, json: { success: true, message: 'ok', data } })

const DOMAIN = {
  id: 'd-1',
  domain: 'fund.com',
  isVerified: true,
  restrictOrgCreation: true,
  joinPolicy: 'INVITE_ONLY',
  authPolicy: 'ANY',
}

const SP = {
  spEntityId: 'https://api.example.com/api/v1/auth/sso/d-1',
  acsUrl: 'https://api.example.com/api/v1/auth/sso/d-1/acs',
}

const UNCONFIGURED = {
  domain: 'fund.com',
  authPolicy: 'ANY',
  enabled: false,
  configured: false,
  ...SP,
  idpEntityId: null,
  idpSsoUrl: null,
  certificateExpiresAt: null,
  testedAt: null,
  lastLoginAt: null,
}

const CONFIGURED = {
  ...UNCONFIGURED,
  configured: true,
  idpEntityId: 'https://idp.example.com/entity',
  idpSsoUrl: 'https://idp.example.com/sso',
  certificateExpiresAt: '2126-01-01T00:00:00.000Z',
}

const TESTED = { ...CONFIGURED, testedAt: '2030-01-02T00:00:00.000Z' }
const ENABLED = { ...TESTED, enabled: true }

const workspace = (role: 'OWNER' | 'ADMIN' | 'MEMBER', authPolicy = 'ANY') => ({
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
  domains: [{ ...DOMAIN, authPolicy }],
  subscription: null,
})

const signInAs = async (
  page: Page,
  role: 'OWNER' | 'ADMIN' | 'MEMBER',
  authPolicy = 'ANY',
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
    ok(route, workspace(role, authPolicy)),
  )
  await page.route('**/api/v1/teams/members', (route) => ok(route, []))
  await page.route('**/api/v1/teams/invites', (route) => ok(route, []))
  await page.route('**/api/v1/payments/me/usage', (route) =>
    route.fulfill({ status: 404, json: { success: false } }),
  )
}

const sso = (page: Page) =>
  page.getByRole('region', { name: 'Single sign-on for fund.com' })

test.describe('workspace single sign-on setup', () => {
  test('the security route opens the Security tab with the values for the IdP', async ({
    page,
  }) => {
    await signInAs(page, 'OWNER')
    await page.route('**/api/v1/teams/domains/fund.com/sso', (route) =>
      ok(route, UNCONFIGURED),
    )

    await page.goto('/settings/workspace/security')

    await expect(page.getByRole('tab', { name: 'Security' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(sso(page).getByTestId('value-ACS URL')).toHaveText(SP.acsUrl)
    await expect(sso(page).getByTestId('value-Entity ID')).toHaveText(
      SP.spEntityId,
    )
    await expect(sso(page).getByText('Not configured')).toBeVisible()
  })

  test('a plain member opening the security route lands on Overview', async ({
    page,
  }) => {
    await signInAs(page, 'MEMBER')

    await page.goto('/settings/workspace/security')

    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('tab', { name: 'Security' })).toHaveCount(0)
  })

  test('saves from a metadata URL, tests at the IdP, enables, then the owner requires SSO', async ({
    page,
  }) => {
    await signInAs(page, 'OWNER')
    let current: Record<string, unknown> = UNCONFIGURED
    let saved: unknown
    let enabledBody: unknown
    let policyBody: unknown

    await page.route('**/api/v1/teams/domains/fund.com/sso', async (route) => {
      if (route.request().method() === 'PUT') {
        saved = route.request().postDataJSON()
        current = CONFIGURED
      }
      return ok(route, current)
    })
    await page.route('**/api/v1/teams/domains/fund.com/sso/test', (route) =>
      ok(route, { redirectUrl: 'https://idp.example.com/sso?SAMLRequest=x' }),
    )
    // The IdP signs the admin in and the backend sends them back with the result.
    await page.route('https://idp.example.com/**', (route) => {
      current = TESTED
      return route.fulfill({
        status: 302,
        headers: {
          location:
            'http://localhost:4173/settings/workspace/security?sso_test=passed',
        },
      })
    })
    await page.route(
      '**/api/v1/teams/domains/fund.com/sso/enabled',
      (route) => {
        enabledBody = route.request().postDataJSON()
        current = ENABLED
        return ok(route, ENABLED)
      },
    )
    await page.route(
      '**/api/v1/teams/domains/fund.com/auth-policy',
      (route) => {
        policyBody = route.request().postDataJSON()
        return ok(route, {
          ...DOMAIN,
          authPolicy: 'SAML_SSO',
          revokedSessions: 3,
        })
      },
    )

    await page.goto('/settings/workspace/security')
    await sso(page)
      .getByRole('textbox', { name: 'Metadata URL' })
      .fill('https://idp.example.com/metadata')
    await sso(page).getByRole('button', { name: 'Save connection' }).click()
    await expect(sso(page).getByText('Needs a test')).toBeVisible()
    expect(saved).toEqual({
      source: 'METADATA_URL',
      metadataUrl: 'https://idp.example.com/metadata',
    })
    await expect(
      sso(page).getByRole('button', { name: 'Enable SSO' }),
    ).toBeDisabled()

    await sso(page).getByRole('button', { name: 'Test SSO connection' }).click()
    await expect(page).toHaveURL(/sso_test=|\/settings\/workspace\/security$/)
    await expect(page.getByText('SSO test passed')).toBeVisible()
    await expect(page).not.toHaveURL(/sso_test/)
    await expect(sso(page).getByText('Tested, not enabled')).toBeVisible()

    await sso(page).getByRole('button', { name: 'Enable SSO' }).click()
    await expect(sso(page).getByText('Enabled', { exact: true })).toBeVisible()
    expect(enabledBody).toEqual({ enabled: true })

    // Only now can the owner require it for everyone.
    await page
      .getByLabel('Sign-in method for fund.com')
      .selectOption('SAML_SSO')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('passed the SSO test yourself')
    await dialog.getByLabel('Type fund.com to confirm').fill('fund.com')
    await dialog.getByRole('button', { name: 'Confirm' }).click()
    await expect
      .poll(() => policyBody)
      .toEqual({ authPolicy: 'SAML_SSO', confirmDomain: 'fund.com' })
  })

  test('the SSO option is not offered until SSO is enabled and tested', async ({
    page,
  }) => {
    await signInAs(page, 'OWNER')
    await page.route('**/api/v1/teams/domains/fund.com/sso', (route) =>
      ok(route, CONFIGURED),
    )

    await page.goto('/settings/workspace/security')
    await expect(sso(page).getByText('Needs a test')).toBeVisible()

    await expect(
      page.locator('select[aria-label="Sign-in method for fund.com"] option'),
    ).toHaveCount(3)
  })

  test('a failed test says so', async ({ page }) => {
    await signInAs(page, 'OWNER')
    await page.route('**/api/v1/teams/domains/fund.com/sso', (route) =>
      ok(route, CONFIGURED),
    )

    await page.goto('/settings/workspace/security?sso_test=failed')

    await expect(page.getByText('The SSO test did not pass')).toBeVisible()
    await expect(page).not.toHaveURL(/sso_test/)
  })

  test('an admin can set SSO up and test it, but only the owner switches it on', async ({
    page,
  }) => {
    await signInAs(page, 'ADMIN')
    await page.route('**/api/v1/teams/domains/fund.com/sso', (route) =>
      ok(route, TESTED),
    )

    await page.goto('/settings/workspace/security')

    await expect(sso(page).getByText('Tested, not enabled')).toBeVisible()
    await expect(
      sso(page).getByRole('button', { name: 'Enable SSO' }),
    ).toBeDisabled()
    await expect(
      sso(page).getByText('Only the workspace owner can switch SSO on'),
    ).toBeVisible()
    await expect(page.getByLabel('Sign-in method for fund.com')).toBeDisabled()
  })

  test('a required domain locks the connection until the policy changes', async ({
    page,
  }) => {
    await signInAs(page, 'OWNER', 'SAML_SSO')
    await page.route('**/api/v1/teams/domains/fund.com/sso', (route) =>
      ok(route, { ...ENABLED, authPolicy: 'SAML_SSO' }),
    )

    await page.goto('/settings/workspace/security')

    await expect(sso(page).getByText('Required for everyone')).toBeVisible()
    await expect(
      sso(page).getByRole('button', { name: 'Remove connection' }),
    ).toBeDisabled()
    await expect(
      sso(page).getByRole('button', { name: 'Disable SSO' }),
    ).toBeDisabled()
  })

  test('removing the connection asks first and reports who was signed out', async ({
    page,
  }) => {
    await signInAs(page, 'OWNER')
    let removed = false
    await page.route('**/api/v1/teams/domains/fund.com/sso', (route) => {
      if (route.request().method() === 'DELETE') {
        removed = true
        return ok(route, { revokedSessions: 2 })
      }
      return ok(route, removed ? UNCONFIGURED : ENABLED)
    })

    await page.goto('/settings/workspace/security')
    await sso(page).getByRole('button', { name: 'Remove connection' }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Remove connection' })
      .click()

    await expect(page.getByText('2 sessions were signed out')).toBeVisible()
    await expect(sso(page).getByText('Not configured')).toBeVisible()
  })

  test('the SSO section is absent while the feature is switched off', async ({
    page,
  }) => {
    await signInAs(page, 'OWNER')
    await page.route('**/api/v1/teams/domains/fund.com/sso', (route) =>
      route.fulfill({
        status: 403,
        json: {
          success: false,
          message: 'Single sign-on is not enabled',
          statusCode: 403,
          errorCode: 'FORBIDDEN_FEATURE_DISABLED',
        },
      }),
    )

    await page.goto('/settings/workspace/security')

    await expect(page.getByText('Sign-in security')).toBeVisible()
    await expect(sso(page)).toHaveCount(0)
    // The "SSO" policy option is not offered either.
    await expect(
      page.locator('select[aria-label="Sign-in method for fund.com"] option'),
    ).toHaveCount(3)
  })
})

test.describe('staff SSO tools', () => {
  const REASON = 'IdP certificate expired and the owner is locked out, SUP-88'

  const openTeam = async (
    page: Page,
    role: 'SUPPORT_AGENT' | 'PLATFORM_ADMIN',
  ) => {
    await mockLoggedIn(
      page,
      {
        userId: 'staff-1',
        email: 'staff@venturedive.com',
        displayName: 'Staff Member',
        phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
        platformRole: role,
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
              authPolicy: 'SAML_SSO',
              samlEnabled: true,
            },
          ],
          members: [],
          subscription: null,
        },
      ]),
    )
    await page.route('**/api/v1/admin/teams/domains/fund.com/sso', (route) =>
      ok(route, {
        domain: 'fund.com',
        domainId: 'd-1',
        teamId: 'team-1',
        authPolicy: 'SAML_SSO',
        enabled: true,
        configured: true,
        idpEntityId: 'https://idp.example.com/entity',
        idpSsoUrl: 'https://idp.example.com/sso',
        certificateExpiresAt: '2020-01-01T00:00:00.000Z',
        testedAt: '2030-01-02T00:00:00.000Z',
        lastLoginAt: '2030-01-03T00:00:00.000Z',
        updatedByUserId: 'u-1',
        activeSsoSessions: 12,
        recentActivity: [
          {
            id: 'a1',
            action: 'SAML_ENABLED',
            actorUserId: 'u-1',
            metadata: null,
            createdAt: '2030-01-04T00:00:00.000Z',
          },
        ],
      }),
    )
    await page.goto('/admin')
    await page.getByRole('tab', { name: 'Team workspaces' }).click()
    await page.getByLabel('Search teams').fill('alpha')
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page.getByText('SSO on')).toBeVisible()
    await page.getByRole('button', { name: 'View SSO for fund.com' }).click()
    await expect(page.getByRole('dialog')).toContainText('SSO for fund.com')
  }

  test('support can read a customer’s SSO but not change it', async ({
    page,
  }) => {
    await openTeam(page, 'SUPPORT_AGENT')
    const dialog = page.getByRole('dialog')

    await expect(dialog).toContainText('Required for everyone')
    await expect(dialog).toContainText('12')
    await expect(dialog).toContainText('Saml enabled')
    await expect(
      dialog.getByRole('button', { name: 'Disable SSO' }),
    ).toHaveCount(0)
    await expect(
      dialog.getByRole('button', { name: 'Reset SSO setup' }),
    ).toHaveCount(0)
  })

  test('a platform admin disables a broken SSO with an audited reason', async ({
    page,
  }) => {
    await openTeam(page, 'PLATFORM_ADMIN')
    let path = ''
    let body: unknown
    await page.route(
      '**/api/v1/admin/teams/domains/fund.com/sso/disable',
      (route) => {
        path = new URL(route.request().url()).pathname
        body = route.request().postDataJSON()
        return ok(route, { domain: 'fund.com', revokedSessions: 12 })
      },
    )

    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Disable SSO' })
      .click()
    await page.getByLabel('Reason (audited)').fill(REASON)
    await page.getByLabel('Support ticket').fill('SUP-88')
    await page.getByRole('button', { name: 'Disable SSO' }).click()

    await expect
      .poll(() => body)
      .toEqual({ reason: REASON, ticketRef: 'SUP-88' })
    expect(path).toBe('/api/v1/admin/teams/domains/fund.com/sso/disable')
    await expect(page.getByText('SSO disabled')).toBeVisible()
  })

  test('a platform admin resets the SSO setup', async ({ page }) => {
    await openTeam(page, 'PLATFORM_ADMIN')
    let body: unknown
    await page.route(
      '**/api/v1/admin/teams/domains/fund.com/sso/reset',
      (route) => {
        body = route.request().postDataJSON()
        return ok(route, { domain: 'fund.com', revokedSessions: 12 })
      },
    )

    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Reset SSO setup' })
      .click()
    await page.getByLabel('Reason (audited)').fill(REASON)
    await page.getByLabel('Support ticket').fill('SUP-88')
    await page.getByRole('button', { name: 'Reset SSO', exact: true }).click()

    await expect
      .poll(() => body)
      .toEqual({ reason: REASON, ticketRef: 'SUP-88' })
    await expect(page.getByText('SSO setup reset')).toBeVisible()
  })
})
