import { expect, test, type Page, type Route } from '@playwright/test'
import { mockLoggedIn } from './mocks'

// Workspace administration: roles, pending invites, leaving, billing contact,
// seat reduction, receipts, the activity log, and the owner-only settings.
// All network is mocked — no real backend/DB, per e2e/README.md.

type Role = 'OWNER' | 'ADMIN' | 'MEMBER'

const ME = 'e2e-user-1'

const workspace = (role: Role, overrides: Record<string, unknown> = {}) => ({
  id: 'team-1',
  name: 'Alpha Fund',
  status: 'ACTIVE',
  role,
  seats: {
    capacity: 6,
    scheduledCapacity: null,
    active: 3,
    pendingInvites: 1,
    available: 2,
  },
  creditBalanceInPaisa: 100_000,
  orgInstructions: null,
  billingEmail: null,
  domains: [],
  subscription: null,
  ...overrides,
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
  {
    userId: 'u-2',
    displayName: 'Sam Lee',
    role: 'MEMBER',
    joinedAt: '2026-02-01T00:00:00Z',
    email: 'sam@fund.com',
    monthlyCreditLimitPaisa: null,
  },
  {
    userId: 'u-3',
    displayName: 'Kim Park',
    role: 'ADMIN',
    joinedAt: '2026-03-01T00:00:00Z',
    email: 'kim@fund.com',
    monthlyCreditLimitPaisa: null,
  },
]

const INVITES = [
  {
    id: 'inv-1',
    email: 'newhire@fund.com',
    role: 'MEMBER',
    expiresAt: '2099-01-01T00:00:00Z',
    createdAt: '2026-09-01T00:00:00Z',
  },
]

const ok = (route: Route, data: unknown = undefined) =>
  route.fulfill({ status: 200, json: { success: true, message: 'ok', data } })

/** Signs in as the workspace's current user and answers the calls every tab makes. */
const openWorkspace = async (
  page: Page,
  role: Role,
  options: { team?: Record<string, unknown>; members?: typeof MEMBERS } = {},
) => {
  await mockLoggedIn(page, {
    userId: ME,
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
    ok(route, workspace(role, options.team)),
  )
  await page.route('**/api/v1/teams/members', (route) =>
    ok(route, options.members ?? MEMBERS),
  )
  await page.route('**/api/v1/teams/invites', (route) => ok(route, INVITES))
  await page.route('**/api/v1/payments/me/usage', (route) =>
    route.fulfill({ status: 404, json: { success: false } }),
  )
  await page.goto('/teams')
  await expect(page.getByRole('heading', { name: 'Alpha Fund' })).toBeVisible()
}

const tab = (page: Page, name: string) => page.getByRole('tab', { name })

// ─── Roles and membership ────────────────────────────────────────────────────

test.describe('roles and membership', () => {
  test('the owner promotes a member with the role selector', async ({
    page,
  }) => {
    await openWorkspace(page, 'OWNER')
    let body: unknown
    await page.route('**/api/v1/teams/members/u-2/role', (route) => {
      body = route.request().postDataJSON()
      return ok(route, { userId: 'u-2', role: 'ADMIN' })
    })

    await tab(page, 'Members').click()
    await page.getByLabel('Role for Sam Lee').selectOption('ADMIN')

    await expect.poll(() => body).toEqual({ role: 'ADMIN' })
    await expect(page.getByText('Sam Lee is now an admin')).toBeVisible()
  })

  test("the owner's own row and the owner badge have no role selector", async ({
    page,
  }) => {
    await openWorkspace(page, 'OWNER')
    await tab(page, 'Members').click()
    await expect(page.getByLabel('Role for Sam Lee')).toBeVisible()
    await expect(page.getByLabel('Role for Alex Morgan')).toHaveCount(0)
  })

  test('an admin sees roles as plain badges — only the owner changes them', async ({
    page,
  }) => {
    await openWorkspace(page, 'ADMIN')
    await tab(page, 'Members').click()
    await expect(page.getByRole('cell', { name: 'Sam Lee' })).toBeVisible()
    await expect(page.getByLabel('Role for Sam Lee')).toHaveCount(0)
  })

  test('pending invites can be resent and revoked', async ({ page }) => {
    await openWorkspace(page, 'OWNER')
    const calls: string[] = []
    await page.route('**/api/v1/teams/invites/inv-1/resend', (route) => {
      calls.push('resend')
      return ok(route, {
        invite: INVITES[0],
        inviteLink: 'https://app/x',
        emailQueued: true,
      })
    })
    await page.route('**/api/v1/teams/invites/inv-1', (route) => {
      calls.push(route.request().method())
      return ok(route)
    })

    await tab(page, 'Members').click()
    await expect(page.getByText('newhire@fund.com')).toBeVisible()

    await page.getByRole('button', { name: 'Resend' }).click()
    await expect(
      page.getByText('A fresh invite was sent to newhire@fund.com'),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Revoke' }).click()
    await expect.poll(() => calls).toEqual(['resend', 'DELETE'])
  })

  test('a member can leave the workspace after confirming', async ({
    page,
  }) => {
    await openWorkspace(page, 'MEMBER')
    let left = false
    await page.route('**/api/v1/teams/leave', (route) => {
      left = true
      return ok(route)
    })

    await tab(page, 'Members').click()
    await page.getByRole('button', { name: 'Leave workspace' }).click()
    await page.getByRole('button', { name: 'Leave', exact: true }).click()

    await expect.poll(() => left).toBe(true)
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('the owner has no leave button — ownership must be transferred first', async ({
    page,
  }) => {
    await openWorkspace(page, 'OWNER')
    await tab(page, 'Members').click()
    await expect(
      page.getByRole('button', { name: 'Invite member' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Leave workspace' }),
    ).toHaveCount(0)
  })

  test('plain members do not see Billing, Activity or Settings', async ({
    page,
  }) => {
    await openWorkspace(page, 'MEMBER')
    for (const name of ['Billing', 'Activity', 'Settings', 'Credits']) {
      await expect(tab(page, name)).toHaveCount(0)
    }
    await expect(tab(page, 'Members')).toBeVisible()
  })
})

// ─── Billing ─────────────────────────────────────────────────────────────────

test.describe('billing', () => {
  const TRANSACTIONS = {
    entries: [
      {
        id: 'txn-1',
        referenceNumber: 'SP-2026-ABCD1234',
        kind: 'SUBSCRIPTION',
        description: 'Team plan subscription',
        status: 'COMPLETED',
        amountPaisa: 4_499_400,
        currency: 'PKR',
        seatCount: 6,
        createdAt: '2026-09-05T10:00:00Z',
      },
    ],
    nextCursor: null,
  }

  const openBilling = async (page: Page, role: Role = 'OWNER', team = {}) => {
    await openWorkspace(page, role, { team })
    await page.route('**/api/v1/payments/team/transactions', (route) =>
      ok(route, TRANSACTIONS),
    )
    await tab(page, 'Billing').click()
  }

  test('saves the billing contact', async ({ page }) => {
    await openBilling(page)
    let body: unknown
    await page.route('**/api/v1/teams/billing-contact', (route) => {
      body = route.request().postDataJSON()
      return ok(route, { billingEmail: 'accounts@fund.com' })
    })

    await page.getByLabel('Billing email').fill('accounts@fund.com')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect.poll(() => body).toEqual({ billingEmail: 'accounts@fund.com' })
    await expect(page.getByText('Billing contact saved')).toBeVisible()
  })

  test('can go back to the owner as the billing contact', async ({ page }) => {
    await openBilling(page, 'OWNER', { billingEmail: 'accounts@fund.com' })
    let body: unknown
    await page.route('**/api/v1/teams/billing-contact', (route) => {
      body = route.request().postDataJSON()
      return ok(route, { billingEmail: null })
    })

    await page.getByRole('button', { name: 'Use the owner' }).click()
    await expect.poll(() => body).toEqual({ billingEmail: null })
  })

  test('schedules a seat reduction within the allowed range', async ({
    page,
  }) => {
    await openBilling(page)
    let body: unknown
    await page.route('**/api/v1/teams/seats/reduce', (route) => {
      body = route.request().postDataJSON()
      return ok(route, { seatCapacity: 6, scheduledSeatCapacity: 5 })
    })

    // 3 members + 1 pending invite are in use, so 4 is the floor and 6 (today's seats) is out of range.
    const input = page.getByLabel('Seats from the next renewal')
    await expect(input).toHaveValue('4')
    await input.fill('6')
    await expect(
      page.getByRole('button', { name: 'Schedule reduction' }),
    ).toBeDisabled()
    await input.fill('5')
    await page.getByRole('button', { name: 'Schedule reduction' }).click()

    await expect.poll(() => body).toEqual({ seatCount: 5 })
  })

  test('shows a scheduled reduction and lets the owner cancel it', async ({
    page,
  }) => {
    await openBilling(page, 'OWNER', {
      seats: {
        capacity: 6,
        scheduledCapacity: 4,
        active: 3,
        pendingInvites: 0,
        available: 1,
      },
    })
    await expect(page.getByText(/next renewal will bill/)).toContainText(
      '4 seats',
    )

    let method = ''
    await page.route('**/api/v1/teams/seats/reduce', (route) => {
      method = route.request().method()
      return ok(route, { seatCapacity: 6, scheduledSeatCapacity: null })
    })
    await page.getByRole('button', { name: 'Cancel reduction' }).click()
    await expect.poll(() => method).toBe('DELETE')
  })

  test('lists receipts and opens one', async ({ page }) => {
    await openBilling(page)
    await page.route(
      '**/api/v1/payments/team/transactions/txn-1/receipt',
      (route) =>
        ok(route, {
          ...TRANSACTIONS.entries[0],
          unitPricePaisa: 749_900,
          paymentMethod: 'card',
          paidAt: '2026-09-05T10:05:00Z',
          teamName: 'Alpha Fund',
          billedTo: 'accounts@fund.com',
        }),
    )

    await expect(page.getByText('SP-2026-ABCD1234').first()).toBeVisible()
    await page
      .getByRole('button', { name: 'View receipt SP-2026-ABCD1234' })
      .click()

    const dialog = page.getByRole('dialog', { name: 'Payment receipt' })
    await expect(dialog.getByText('accounts@fund.com')).toBeVisible()
    await expect(dialog.getByText('Rs 7,499')).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Download PDF' }),
    ).toBeVisible()
  })

  test('says so when there are no payments yet', async ({ page }) => {
    await openWorkspace(page, 'OWNER')
    await page.route('**/api/v1/payments/team/transactions', (route) =>
      ok(route, { entries: [], nextCursor: null }),
    )
    await tab(page, 'Billing').click()
    await expect(page.getByText('No payments yet.')).toBeVisible()
  })
})

// ─── Activity ────────────────────────────────────────────────────────────────

test.describe('activity log', () => {
  const entry = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    action: 'ROLE_CHANGED',
    actorUserId: ME,
    actorName: 'Alex Morgan',
    targetUserId: 'u-2',
    targetName: 'Sam Lee',
    metadata: { from: 'MEMBER', to: 'ADMIN' },
    createdAt: '2026-09-10T09:30:00Z',
    ...overrides,
  })

  test('shows who did what, marking system actions and former members', async ({
    page,
  }) => {
    await openWorkspace(page, 'ADMIN')
    await page.route('**/api/v1/teams/audit-log*', (route) =>
      ok(route, {
        entries: [
          entry('a1'),
          entry('a2', {
            action: 'SUBSCRIPTION_EXPIRED',
            actorUserId: null,
            actorName: null,
            targetUserId: null,
            targetName: null,
          }),
          entry('a3', {
            action: 'MEMBER_REMOVED',
            targetName: null,
          }),
        ],
        nextCursor: null,
      }),
    )

    await tab(page, 'Activity').click()

    await expect(
      page.getByRole('cell', { name: 'Changed a role' }),
    ).toBeVisible()
    await expect(page.getByRole('cell', { name: 'System' })).toBeVisible()
    await expect(
      page.getByRole('cell', { name: 'Subscription expired' }),
    ).toBeVisible()
    await expect(
      page.getByRole('cell', { name: 'Former member' }),
    ).toBeVisible()
  })

  test('loads older entries with the cursor', async ({ page }) => {
    await openWorkspace(page, 'OWNER')
    const cursors: (string | null)[] = []
    await page.route('**/api/v1/teams/audit-log*', (route) => {
      const cursor = new URL(route.request().url()).searchParams.get('cursor')
      cursors.push(cursor)
      return ok(
        route,
        cursor
          ? {
              entries: [entry('a2', { action: 'MEMBER_INVITED' })],
              nextCursor: null,
            }
          : { entries: [entry('a1')], nextCursor: 'a1' },
      )
    })

    await tab(page, 'Activity').click()
    await expect(
      page.getByRole('cell', { name: 'Changed a role' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Load more' }).click()

    await expect(
      page.getByRole('cell', { name: 'Invited a member' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0)
    expect(cursors).toEqual([null, 'a1'])
  })

  test('says so when nothing has happened yet', async ({ page }) => {
    await openWorkspace(page, 'OWNER')
    await page.route('**/api/v1/teams/audit-log*', (route) =>
      ok(route, { entries: [], nextCursor: null }),
    )
    await tab(page, 'Activity').click()
    await expect(page.getByText('No activity recorded yet.')).toBeVisible()
  })
})

// ─── Settings ────────────────────────────────────────────────────────────────

test.describe('workspace settings', () => {
  test('an admin can rename but sees no ownership, export or delete controls', async ({
    page,
  }) => {
    await openWorkspace(page, 'ADMIN')
    await tab(page, 'Settings').click()

    await expect(page.getByLabel('Name', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Transfer ownership' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Export workspace data' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Delete workspace' }),
    ).toHaveCount(0)
  })

  test('renames the workspace', async ({ page }) => {
    await openWorkspace(page, 'OWNER')
    let body: unknown
    await page.route('**/api/v1/teams', (route) => {
      body = route.request().postDataJSON()
      return ok(route, { id: 'team-1', name: 'Beta Fund' })
    })

    await tab(page, 'Settings').click()
    await page.getByLabel('Name', { exact: true }).fill('Beta Fund')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect.poll(() => body).toEqual({ name: 'Beta Fund' })
  })

  test('transfers ownership to a seated member', async ({ page }) => {
    await openWorkspace(page, 'OWNER')
    let body: unknown
    await page.route('**/api/v1/teams/ownership/transfer', (route) => {
      body = route.request().postDataJSON()
      return ok(route)
    })

    await tab(page, 'Settings').click()
    await page.getByRole('button', { name: 'Transfer ownership' }).click()
    const dialog = page.getByRole('dialog', { name: 'Transfer ownership' })

    // The owner is not offered; nobody with only a pending invite can be (they have no membership).
    await expect(
      dialog.getByRole('option', { name: /Alex Morgan/ }),
    ).toHaveCount(0)
    await expect(
      dialog.getByRole('button', { name: 'Transfer', exact: true }),
    ).toBeDisabled()
    await dialog.getByLabel('New owner').selectOption('u-3')
    await dialog.getByRole('button', { name: 'Transfer', exact: true }).click()

    await expect.poll(() => body).toEqual({ userId: 'u-3' })
    await expect(page.getByText('Ownership transferred')).toBeVisible()
  })

  test('exports the workspace as a JSON download', async ({ page }) => {
    await openWorkspace(page, 'OWNER')
    await page.route('**/api/v1/teams/export', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Content-Disposition': 'attachment; filename="workspace-export.json"',
        },
        body: JSON.stringify({ team: { id: 'team-1' } }),
      }),
    )

    await tab(page, 'Settings').click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export workspace data' }).click()

    expect((await download).suggestedFilename()).toBe('workspace-export.json')
  })

  test('deleting needs the exact workspace name', async ({ page }) => {
    await openWorkspace(page, 'OWNER')
    let body: unknown
    await page.route('**/api/v1/teams', (route) => {
      body = route.request().postDataJSON()
      return ok(route)
    })

    await tab(page, 'Settings').click()
    await page.getByRole('button', { name: 'Delete workspace' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Delete workspace' })
    const confirm = dialog.getByRole('button', { name: 'Delete workspace' })

    await expect(confirm).toBeDisabled()
    await dialog.getByLabel(/Type/).fill('alpha fund')
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel(/Type/).fill('Alpha Fund')
    await confirm.click()

    await expect.poll(() => body).toEqual({ confirmName: 'Alpha Fund' })
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('a failed deletion keeps the dialog open and says why', async ({
    page,
  }) => {
    await openWorkspace(page, 'OWNER')
    await page.route('**/api/v1/teams', (route) =>
      route.fulfill({
        status: 400,
        json: {
          success: false,
          message: 'Type the workspace name exactly to confirm',
        },
      }),
    )

    await tab(page, 'Settings').click()
    await page.getByRole('button', { name: 'Delete workspace' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Delete workspace' })
    await dialog.getByLabel(/Type/).fill('Alpha Fund')
    await dialog.getByRole('button', { name: 'Delete workspace' }).click()

    await expect(
      page.getByText('Type the workspace name exactly to confirm'),
    ).toBeVisible()
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL(/\/teams/)
  })
})
