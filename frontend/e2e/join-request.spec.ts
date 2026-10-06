import { expect, test, type Page, type Route } from '@playwright/test'
import { mockLoggedIn } from './mocks'

// Request-to-join: a colleague on a verified domain finds the workspace and
// asks to join (or joins at once), and owners/admins manage the queue and the
// per-domain join policy. All network is mocked — no real backend/DB, per
// e2e/README.md.

type Role = 'OWNER' | 'ADMIN' | 'MEMBER'
type Policy = 'INVITE_ONLY' | 'REQUEST_APPROVAL' | 'AUTO_APPROVE'

const ME = 'e2e-user-1'

const ok = (route: Route, data: unknown = undefined) =>
  route.fulfill({ status: 200, json: { success: true, message: 'ok', data } })

const noTeam = (route: Route) =>
  route.fulfill({
    status: 404,
    json: { success: false, message: 'No workspace' },
  })

const workspace = (role: Role, joinPolicy: Policy = 'INVITE_ONLY') => ({
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
    {
      id: 'dom-1',
      domain: 'fund.com',
      isVerified: true,
      restrictOrgCreation: true,
      joinPolicy,
    },
    {
      id: 'dom-2',
      domain: 'pending.com',
      isVerified: false,
      restrictOrgCreation: false,
      joinPolicy: 'INVITE_ONLY',
    },
  ],
  subscription: null,
})

const MEMBERS = [
  {
    userId: ME,
    displayName: 'Alex Morgan',
    role: 'OWNER',
    joinedAt: '2026-01-01T00:00:00Z',
    email: 'alex@fund.com',
    monthlyCreditLimitPaisa: null,
  },
]

const JOIN_REQUESTS = [
  {
    id: 'jr-1',
    userId: 'u-10',
    displayName: 'Dana Fox',
    email: 'dana@fund.com',
    status: 'PENDING',
    createdAt: '2026-09-20T00:00:00Z',
  },
  {
    id: 'jr-2',
    userId: 'u-11',
    displayName: 'Eli Stone',
    email: 'eli@fund.com',
    status: 'PENDING',
    createdAt: '2026-09-21T00:00:00Z',
  },
]

const tab = (page: Page, name: string) => page.getByRole('tab', { name })

const signIn = async (page: Page, plan: 'FREE' | 'TEAM') => {
  await mockLoggedIn(page, {
    userId: ME,
    email: 'alex@fund.com',
    displayName: 'Alex Morgan',
    phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
    plan,
  })
  await page.route('**/api/v1/rbac/user-screens', (route) =>
    route.fulfill({
      status: 200,
      json: { data: { CORE_APP: { canRead: true } } },
    }),
  )
  await page.route('**/api/v1/payments/me/usage', (route) =>
    route.fulfill({ status: 404, json: { success: false } }),
  )
}

// ─── The colleague asking to join ────────────────────────────────────────────

test.describe('requesting to join', () => {
  test('request, see it pending, then cancel it', async ({ page }) => {
    await signIn(page, 'FREE')
    await page.route('**/api/v1/teams/me', noTeam)
    let mine: unknown = null
    let requestBody: unknown
    let cancelled = false
    await page.route('**/api/v1/teams/join-options', (route) =>
      ok(route, [
        {
          teamId: 'team-1',
          teamName: 'Alpha Fund',
          domain: 'fund.com',
          joinPolicy: 'REQUEST_APPROVAL',
        },
      ]),
    )
    await page.route('**/api/v1/teams/join-requests/me', (route) => {
      if (route.request().method() === 'DELETE') {
        cancelled = true
        mine = null
        return ok(route)
      }
      return ok(route, mine)
    })
    await page.route('**/api/v1/teams/join-requests', (route) => {
      requestBody = route.request().postDataJSON()
      mine = {
        id: 'jr-9',
        teamId: 'team-1',
        teamName: 'Alpha Fund',
        status: 'PENDING',
        createdAt: '2026-09-30T00:00:00Z',
      }
      return ok(route, { teamId: 'team-1', status: 'PENDING' })
    })

    await page.goto('/teams')
    await expect(page.getByText('Workspace found')).toBeVisible()
    await page
      .getByRole('button', { name: 'Request to join Alpha Fund' })
      .click()

    await expect.poll(() => requestBody).toEqual({ teamId: 'team-1' })
    await expect(
      page.getByText(
        'Your request to join Alpha Fund is pending admin approval.',
      ),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Request to join Alpha Fund' }),
    ).toHaveCount(0)

    await page.getByRole('button', { name: 'Cancel request' }).click()
    await expect.poll(() => cancelled).toBe(true)
    await expect(
      page.getByRole('button', { name: 'Request to join Alpha Fund' }),
    ).toBeVisible()
  })

  test('an auto-approve domain joins at once and lands in the workspace', async ({
    page,
  }) => {
    await signIn(page, 'FREE')
    let joined = false
    // After joining, the session shows the TEAM plan and the workspace exists.
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 200,
        json: {
          user: {
            userId: ME,
            email: 'alex@fund.com',
            displayName: 'Alex Morgan',
            phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
            plan: joined ? 'TEAM' : 'FREE',
          },
        },
      }),
    )
    await page.route('**/api/v1/teams/me', (route) =>
      joined ? ok(route, workspace('MEMBER')) : noTeam(route),
    )
    await page.route('**/api/v1/teams/members', (route) => ok(route, MEMBERS))
    await page.route('**/api/v1/teams/join-options', (route) =>
      ok(route, [
        {
          teamId: 'team-1',
          teamName: 'Alpha Fund',
          domain: 'fund.com',
          joinPolicy: 'AUTO_APPROVE',
        },
      ]),
    )
    await page.route('**/api/v1/teams/join-requests/me', (route) =>
      ok(route, null),
    )
    await page.route('**/api/v1/teams/join-requests', (route) => {
      joined = true
      return ok(route, { teamId: 'team-1', status: 'APPROVED' })
    })

    await page.goto('/teams')
    await page.getByRole('button', { name: 'Join Alpha Fund' }).click()

    await expect(
      page.getByRole('heading', { name: 'Alpha Fund' }),
    ).toBeVisible()
    await expect(tab(page, 'Members')).toBeVisible()
  })
})

// ─── The workspace admin ─────────────────────────────────────────────────────

test.describe('managing join requests and policy', () => {
  const openWorkspace = async (
    page: Page,
    role: Role,
    policy: Policy = 'INVITE_ONLY',
  ) => {
    await signIn(page, 'TEAM')
    await page.route('**/api/v1/teams/me', (route) =>
      ok(route, workspace(role, policy)),
    )
    await page.route('**/api/v1/teams/members', (route) => ok(route, MEMBERS))
    await page.route('**/api/v1/teams/invites', (route) => ok(route, []))
    await page.goto('/teams')
    await expect(
      page.getByRole('heading', { name: 'Alpha Fund' }),
    ).toBeVisible()
  }

  test('an admin approves one request and declines another', async ({
    page,
  }) => {
    await openWorkspace(page, 'ADMIN')
    let queue = [...JOIN_REQUESTS]
    const hits: string[] = []
    await page.route('**/api/v1/teams/join-requests', (route) =>
      ok(route, queue),
    )
    await page.route('**/api/v1/teams/join-requests/*/*', (route) => {
      const match = /join-requests\/([^/]+)\/([^/]+)$/.exec(
        new URL(route.request().url()).pathname,
      )
      const [id, action] = [match?.[1], match?.[2]]
      hits.push(`${route.request().method()} ${id}/${action}`)
      queue = queue.filter((r) => r.id !== id)
      return ok(route)
    })

    await tab(page, 'Members').click()
    await expect(
      page.getByRole('heading', { name: /Join requests/ }),
    ).toBeVisible()
    await expect(page.getByText('dana@fund.com')).toBeVisible()
    await expect(page.getByText('eli@fund.com')).toBeVisible()

    await page.getByRole('button', { name: 'Approve Dana Fox' }).click()
    await expect(page.getByText('Dana Fox joined the workspace')).toBeVisible()
    await page.getByRole('button', { name: 'Decline Eli Stone' }).click()

    await expect
      .poll(() => hits)
      .toEqual(['POST jr-1/approve', 'POST jr-2/decline'])
    await expect(page.getByText('No pending join requests.')).toBeVisible()
  })

  test("a full workspace surfaces the server's no-free-seats message", async ({
    page,
  }) => {
    await openWorkspace(page, 'OWNER')
    await page.route('**/api/v1/teams/join-requests', (route) =>
      ok(route, [JOIN_REQUESTS[0]]),
    )
    await page.route('**/api/v1/teams/join-requests/jr-1/approve', (route) =>
      route.fulfill({
        status: 409,
        json: { success: false, message: 'No free seats left' },
      }),
    )

    await tab(page, 'Members').click()
    await page.getByRole('button', { name: 'Approve Dana Fox' }).click()
    await expect(page.getByText('No free seats left')).toBeVisible()
  })

  test("an admin changes a verified domain's join policy", async ({ page }) => {
    await openWorkspace(page, 'OWNER')
    let path = ''
    let body: unknown
    await page.route('**/api/v1/teams/domains/*/join-policy', (route) => {
      path = new URL(route.request().url()).pathname
      body = route.request().postDataJSON()
      return ok(route, { id: 'dom-1', domain: 'fund.com' })
    })

    await tab(page, 'Domains').click()
    const select = page.getByLabel('Join policy for fund.com')
    await expect(select).toHaveValue('INVITE_ONLY')
    await expect(select.locator('option')).toHaveText([
      'Invite only',
      'Require admin approval',
      'Auto-approve',
    ])
    await select.selectOption('REQUEST_APPROVAL')

    await expect.poll(() => body).toEqual({ joinPolicy: 'REQUEST_APPROVAL' })
    expect(path).toBe('/api/v1/teams/domains/fund.com/join-policy')
    await expect(page.getByLabel('Join policy for pending.com')).toBeDisabled()
    await expect(
      page.getByText('Verify this domain to let colleagues join.'),
    ).toBeVisible()
  })

  test('a plain member sees neither the policy dropdown nor the queue', async ({
    page,
  }) => {
    await openWorkspace(page, 'MEMBER')
    await tab(page, 'Members').click()
    await expect(page.getByRole('cell', { name: 'Alex Morgan' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Join requests/ }),
    ).toHaveCount(0)

    await tab(page, 'Domains').click()
    await expect(page.getByText('fund.com', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Join policy for fund.com')).toHaveCount(0)
  })
})
