import { expect, test, type Page, type Route } from '@playwright/test'
import { mockLoggedOut } from './mocks'

// Single sign-on on the login screen: discovery, the IdP round trip and the
// code exchange. All network is mocked, including the identity provider — no
// real backend/DB/IdP, per e2e/README.md.

const IDP_URL = 'https://idp.example.com/sso?SAMLRequest=abc'
const APP_ORIGIN = 'http://localhost:4173'
const REQUIRED = 'single sign-on'

const ok = (route: Route, data: unknown = undefined) =>
  route.fulfill({ status: 200, json: { success: true, message: 'ok', data } })

const mockLoginOptions = (
  page: Page,
  authPolicy: string,
  ssoAvailable: boolean,
) =>
  page.route('**/api/v1/auth/login-options', (route) =>
    ok(route, { authPolicy, ssoAvailable }),
  )

/** The IdP signs the person in and sends the browser back to the app with a one-time code. */
const mockIdp = (page: Page, returnTo: string) =>
  page.route('https://idp.example.com/**', (route) =>
    route.fulfill({ status: 302, headers: { location: returnTo } }),
  )

test.describe('discovery on the login screen', () => {
  test('a domain with SSO offers it alongside the magic link', async ({
    page,
  }) => {
    await mockLoggedOut(page)
    await mockLoginOptions(page, 'ANY', true)
    await page.goto('/login')
    await expect(
      page.getByRole('button', { name: /continue with sso/i }),
    ).toHaveCount(0)

    await page.getByLabel('Email Address').fill('pat@fund.com')

    await expect(
      page.getByRole('button', { name: /continue with sso/i }),
    ).toBeEnabled()
    await expect(
      page.getByRole('button', { name: /continue with email/i }),
    ).toBeEnabled()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('a domain that requires SSO says so and disables the magic link', async ({
    page,
  }) => {
    await mockLoggedOut(page)
    await mockLoginOptions(page, 'SAML_SSO', true)
    await page.goto('/login')

    await page.getByLabel('Email Address').fill('pat@fund.com')

    await expect(page.getByRole('alert')).toContainText(REQUIRED)
    await expect(
      page.getByRole('button', { name: /continue with email/i }),
    ).toBeDisabled()
    await expect(
      page.getByRole('button', { name: /continue with sso/i }),
    ).toBeEnabled()

    await mockLoginOptions(page, 'ANY', false)
    await page.getByLabel('Email Address').fill('pat@other.com')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: /continue with sso/i }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: /continue with email/i }),
    ).toBeEnabled()
  })

  test('a failed round trip explains itself on return', async ({ page }) => {
    await mockLoggedOut(page)
    await mockLoginOptions(page, 'ANY', false)

    await page.goto('/login?sso=failed')

    await expect(page.getByRole('alert')).toContainText(
      'Single sign-on did not complete',
    )
  })
})

test.describe('signing in through the identity provider', () => {
  /** Signed out until the exchange succeeds, then the normal session mocks apply. */
  const mockSession = async (page: Page) => {
    let signedIn = false
    await page.route('**/api/v1/auth/refresh-token', (route) =>
      route.fulfill({
        status: 200,
        json: signedIn ? { accessToken: 'e2e-sso-access-token' } : {},
      }),
    )
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 200,
        json: {
          user: {
            userId: 'e2e-user-1',
            email: 'pat@fund.com',
            displayName: 'Pat',
            phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      }),
    )
    await page.route('**/api/v1/rbac/user-screens', (route) =>
      route.fulfill({
        status: 200,
        json: { data: { CORE_APP: { canRead: true } } },
      }),
    )
    return () => {
      signedIn = true
    }
  }

  test('starts at the IdP, comes back with a code and lands signed in', async ({
    page,
  }) => {
    const markSignedIn = await mockSession(page)
    await mockLoginOptions(page, 'SAML_SSO', true)
    let startBody: unknown
    await page.route('**/api/v1/auth/sso/start', (route) => {
      startBody = route.request().postDataJSON()
      return ok(route, { redirectUrl: IDP_URL, bindingToken: 'binding-1' })
    })
    await mockIdp(page, `${APP_ORIGIN}/auth/sso/complete?code=one-time-code`)
    let exchangeBody: unknown
    await page.route('**/api/v1/auth/sso/exchange', (route) => {
      exchangeBody = route.request().postDataJSON()
      markSignedIn()
      return route.fulfill({
        status: 200,
        json: {
          success: true,
          requiresOnboarding: false,
          requiresPhoneVerification: false,
          accessToken: 'e2e-sso-access-token',
          user: { userId: 'e2e-user-1', email: 'pat@fund.com' },
        },
      })
    })

    await page.goto('/login')
    await page.getByLabel('Email Address').fill('pat@fund.com')
    await page.getByRole('button', { name: /continue with sso/i }).click()

    await expect(page).toHaveURL(/\/dashboard/)
    expect(startBody).toEqual({ email: 'pat@fund.com' })
    // The code is only good together with the token this browser kept.
    expect(exchangeBody).toEqual({
      code: 'one-time-code',
      bindingToken: 'binding-1',
    })
  })

  test('a first-time user is taken to onboarding', async ({ page }) => {
    await mockLoggedOut(page)
    await mockLoginOptions(page, 'ANY', true)
    await page.route('**/api/v1/auth/sso/start', (route) =>
      ok(route, { redirectUrl: IDP_URL, bindingToken: 'binding-1' }),
    )
    await mockIdp(page, `${APP_ORIGIN}/auth/sso/complete?code=new-user-code`)
    await page.route('**/api/v1/auth/sso/exchange', (route) =>
      route.fulfill({
        status: 200,
        json: {
          success: true,
          requiresOnboarding: true,
          onboardingToken: 'onboard-1',
          defaultDisplayName: 'pat',
        },
      }),
    )

    await page.goto('/login')
    await page.getByLabel('Email Address').fill('pat@fund.com')
    await page.getByRole('button', { name: /continue with sso/i }).click()

    await expect(page).toHaveURL(/\/auth\/onboarding/)
  })

  test('a refused exchange shows why and offers a way back', async ({
    page,
  }) => {
    await mockLoggedOut(page)
    await mockLoginOptions(page, 'ANY', true)
    await page.route('**/api/v1/auth/sso/start', (route) =>
      ok(route, { redirectUrl: IDP_URL, bindingToken: 'binding-1' }),
    )
    await mockIdp(page, `${APP_ORIGIN}/auth/sso/complete?code=stale-code`)
    await page.route('**/api/v1/auth/sso/exchange', (route) =>
      route.fulfill({
        status: 401,
        json: {
          success: false,
          message: 'Invalid or expired SSO sign-in',
          statusCode: 401,
        },
      }),
    )

    await page.goto('/login')
    await page.getByLabel('Email Address').fill('pat@fund.com')
    await page.getByRole('button', { name: /continue with sso/i }).click()

    await expect(page.getByRole('alert')).toContainText(
      'Invalid or expired SSO sign-in',
    )
    await page.getByRole('button', { name: /back to sign in/i }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('a code opened in a browser that never started the sign-in is refused', async ({
    page,
  }) => {
    await mockLoggedOut(page)
    let exchanged = false
    await page.route('**/api/v1/auth/sso/exchange', (route) => {
      exchanged = true
      return route.fulfill({ status: 500, json: {} })
    })

    await page.goto('/auth/sso/complete?code=someone-elses-code')

    await expect(page.getByRole('alert')).toContainText(
      'not started in this browser tab',
    )
    expect(exchanged).toBe(false)
  })

  test('a start the server refuses leaves the user on the login screen', async ({
    page,
  }) => {
    await mockLoggedOut(page)
    await mockLoginOptions(page, 'ANY', true)
    await page.route('**/api/v1/auth/sso/start', (route) =>
      route.fulfill({
        status: 400,
        json: {
          success: false,
          message: 'SSO is not available for this email',
          statusCode: 400,
        },
      }),
    )

    await page.goto('/login')
    await page.getByLabel('Email Address').fill('pat@fund.com')
    await page.getByRole('button', { name: /continue with sso/i }).click()

    await expect(
      page.getByText('SSO is not available for this email'),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })
})
