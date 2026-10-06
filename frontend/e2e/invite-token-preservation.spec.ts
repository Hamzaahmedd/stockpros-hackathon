import { expect, test, type Page } from '@playwright/test'
import { mockLoggedIn, mockLoggedOut } from './mocks'

// Covers invite-token preservation across authentication:
//   InviteEntry (public /teams/invite route) parks the token while signed out,
//   PendingInviteAcceptor accepts it after sign-in. All network is mocked —
//   no real backend/DB, per e2e/README.md.

const TOKEN = 'invite-token-XYZ'
const STORAGE_KEY = 'pending_invite_token'

const signedInUser = {
  userId: 'e2e-user-1',
  email: 'invitee@example.com',
  displayName: 'Alex Morgan',
  phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
}

const workspace = {
  id: 'team-1',
  name: 'Alpha Fund',
  status: 'ACTIVE',
  role: 'MEMBER',
  seats: { capacity: 5, active: 2, pendingInvites: 0, available: 3 },
  creditBalanceInPaisa: 0,
  orgInstructions: null,
  domains: [],
  subscription: null,
}

/** Records accept calls and answers them, plus the workspace page's own data. */
const mockTeamApi = async (
  page: Page,
  acceptStatus = 200,
): Promise<{ acceptBodies: unknown[] }> => {
  const acceptBodies: unknown[] = []
  await page.route('**/api/v1/teams/invites/accept', (route) => {
    acceptBodies.push(route.request().postDataJSON())
    return acceptStatus === 200
      ? route.fulfill({
          status: 200,
          json: { success: true, data: { teamId: 'team-1', role: 'MEMBER' } },
        })
      : route.fulfill({
          status: acceptStatus,
          json: { success: false, message: 'Invite not found or expired' },
        })
  })
  await page.route('**/api/v1/teams/me', (route) =>
    route.fulfill({ status: 200, json: { success: true, data: workspace } }),
  )
  return { acceptBodies }
}

/** Gives the mocked session read access to CORE_APP so protected pages render (later routes win in Playwright). */
const grantCoreApp = async (page: Page): Promise<void> => {
  await page.route('**/api/v1/rbac/user-screens', (route) =>
    route.fulfill({
      status: 200,
      json: { data: { CORE_APP: { canRead: true } } },
    }),
  )
}

/** Simulates finishing sign-in: swap the logged-out session mock for a logged-in one. */
const signIn = async (page: Page): Promise<void> => {
  await page.unroute('**/api/v1/auth/refresh-token')
  await mockLoggedIn(page, signedInUser)
  await grantCoreApp(page)
}

for (const path of ['/teams/invite', '/teams/invites/accept']) {
  test(`a signed-out visit to ${path} parks the token and redirects to /login`, async ({
    page,
  }) => {
    await mockLoggedOut(page)
    await page.goto(`${path}?token=${TOKEN}`)

    await expect(page).toHaveURL(/\/login$/)
    expect(
      await page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEY),
    ).toBe(TOKEN)
  })
}

test('after sign-in the parked token is accepted automatically, storage is cleared and the user lands on /teams', async ({
  page,
}) => {
  await mockLoggedOut(page)
  const { acceptBodies } = await mockTeamApi(page)

  await page.goto(`/teams/invite?token=${TOKEN}`)
  await expect(page).toHaveURL(/\/login$/)

  await signIn(page)
  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/teams$/)
  await expect(page.getByRole('heading', { name: 'Alpha Fund' })).toBeVisible()
  expect(acceptBodies).toEqual([{ token: TOKEN }])
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEY),
  ).toBeNull()
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBeNull()
})

test('a token parked in another tab (magic link opens in a new tab) is still picked up via the fallback store', async ({
  page,
}) => {
  await page.addInitScript(
    ([key, token]) => {
      // Only the long-lived fallback exists — sessionStorage is empty, as in a fresh tab.
      localStorage.setItem(
        key,
        JSON.stringify({ token, expiresAt: Date.now() + 60_000 }),
      )
    },
    [STORAGE_KEY, TOKEN],
  )
  await mockLoggedIn(page, signedInUser)
  await grantCoreApp(page)
  const { acceptBodies } = await mockTeamApi(page)

  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/teams$/)
  expect(acceptBodies).toEqual([{ token: TOKEN }])
})

test('an expired fallback token is ignored', async ({ page }) => {
  await page.addInitScript(
    ([key, token]) => {
      localStorage.setItem(
        key,
        JSON.stringify({ token, expiresAt: Date.now() - 1_000 }),
      )
    },
    [STORAGE_KEY, TOKEN],
  )
  await mockLoggedIn(page, signedInUser)
  await grantCoreApp(page)
  const { acceptBodies } = await mockTeamApi(page)

  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/dashboard$/)
  expect(acceptBodies).toHaveLength(0)
})

test('a rejected invite is attempted once, cleared, and leaves the user where they are', async ({
  page,
}) => {
  await page.addInitScript(
    ([key, token]) => sessionStorage.setItem(key, token),
    [STORAGE_KEY, TOKEN],
  )
  await mockLoggedIn(page, signedInUser)
  await grantCoreApp(page)
  const { acceptBodies } = await mockTeamApi(page, 404)

  await page.goto('/dashboard')

  await expect(page.getByText('Invite not found or expired')).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard$/)
  expect(acceptBodies).toHaveLength(1)
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEY),
  ).toBeNull()
})

test('the invite is not accepted while the user is still inside the auth flow (phone verification)', async ({
  page,
}) => {
  await page.addInitScript(
    ([key, token]) => sessionStorage.setItem(key, token),
    [STORAGE_KEY, TOKEN],
  )
  await mockLoggedIn(page, { ...signedInUser, phoneVerifiedAt: null })
  await grantCoreApp(page)
  const { acceptBodies } = await mockTeamApi(page)

  await page.goto('/auth/verify-phone')

  await expect(page).toHaveURL(/\/auth\/verify-phone$/)
  expect(acceptBodies).toHaveLength(0)
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEY),
  ).toBe(TOKEN)
})

test('a signed-in visitor to the invite link sees the confirm page and no token is parked', async ({
  page,
}) => {
  await mockLoggedIn(page, signedInUser)
  await grantCoreApp(page)
  const { acceptBodies } = await mockTeamApi(page)

  await page.goto(`/teams/invite?token=${TOKEN}`)

  await expect(page.getByRole('button', { name: 'Join team' })).toBeVisible()
  expect(acceptBodies).toHaveLength(0)
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEY),
  ).toBeNull()
})
