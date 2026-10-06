import { expect, test, type Page, type Request } from '@playwright/test'
import { mockLoggedIn } from './mocks'

// Covers the Roles and Users admin screens: creating a role, saving the
// permission matrix (which must revoke what was unticked, not just add),
// enabling a supported action that has no permission row yet, and removing a
// user's roles (including the last one). All network is mocked.

const permission = (action: string, resource: string) => ({
  permission: { action, resource: { name: resource } },
})

const roles = () => [
  {
    id: 'role-analyst',
    name: 'ANALYST',
    description: 'Reads and writes the main app',
    createdAt: '2030-01-01T10:00:00.000Z',
    rolePermissions: [
      permission('read', 'core_app'),
      permission('write', 'core_app'),
    ],
  },
  {
    id: 'role-viewer',
    name: 'VIEWER',
    description: 'Read only',
    createdAt: '2030-01-02T10:00:00.000Z',
    rolePermissions: [permission('read', 'core_app')],
  },
]

const resources = [
  { id: 'res-core', name: 'core_app' },
  { id: 'res-role', name: 'role' },
]

// `role` has only `read` defined, so write/delete are offered as "Enable".
const permissions = (extra: string[] = []) => [
  {
    id: 'p1',
    action: 'read',
    resourceId: 'res-core',
    resource: { name: 'core_app' },
  },
  {
    id: 'p2',
    action: 'write',
    resourceId: 'res-core',
    resource: { name: 'core_app' },
  },
  {
    id: 'p3',
    action: 'read',
    resourceId: 'res-role',
    resource: { name: 'role' },
  },
  ...extra.map((action, i) => ({
    id: `x${i}`,
    action,
    resourceId: 'res-role',
    resource: { name: 'role' },
  })),
]

const signInAsAdmin = async (page: Page): Promise<void> => {
  await mockLoggedIn(page, {
    userId: 'e2e-admin',
    email: 'admin@example.com',
    displayName: 'Ada Admin',
    phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
  })
  await page.route('**/api/v1/rbac/user-screens', (route) =>
    route.fulfill({
      status: 200,
      json: {
        data: {
          CORE_APP: { canRead: true },
          ACCESS_CONTROL: { canRead: true },
          ROLE: { canRead: true, canWrite: true, canDelete: true },
        },
      },
    }),
  )
}

type Recorded = { method: string; url: string; body: unknown }

/** Records every mutating rbac request, in order, and answers it with success. */
const mockRbac = async (page: Page, state: { permissions: unknown[] }) => {
  const sent: Recorded[] = []
  await page.route('**/api/v1/rbac/roles', async (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      const body = req.postDataJSON() as { name: string; description: string }
      sent.push({ method: 'POST', url: '/roles', body })
      return route.fulfill({
        status: 201,
        json: {
          success: true,
          data: {
            id: 'role-new',
            ...body,
            createdAt: '2030-02-01T10:00:00.000Z',
          },
        },
      })
    }
    return route.fulfill({
      status: 200,
      json: { success: true, data: roles() },
    })
  })
  await page.route('**/api/v1/rbac/resources', (route) =>
    route.fulfill({ status: 200, json: { success: true, data: resources } }),
  )
  await page.route('**/api/v1/rbac/permissions', (route) =>
    route.fulfill({
      status: 200,
      json: { success: true, data: state.permissions },
    }),
  )
  const record =
    (label: string, status = 200) =>
    async (route: import('@playwright/test').Route) => {
      const req: Request = route.request()
      sent.push({ method: req.method(), url: label, body: req.postDataJSON() })
      return route.fulfill({ status, json: { success: true, data: {} } })
    }
  await page.route(
    '**/api/v1/rbac/assign-permissions',
    record('/assign-permissions'),
  )
  await page.route(
    '**/api/v1/rbac/revoke-permissions',
    record('/revoke-permissions'),
  )
  await page.route('**/api/v1/rbac/resource-mappings', async (route) => {
    state.permissions = permissions(['write'])
    return record('/resource-mappings', 201)(route)
  })
  return sent
}

const openPermissions = async (page: Page, roleName: string) => {
  await page.goto('/access-control/roles')
  const row = page.locator('div.grid', { hasText: roleName }).filter({
    has: page.getByRole('button', { name: 'Permissions' }),
  })
  await row.getByRole('button', { name: 'Permissions' }).click()
  await expect(page.getByText('Edit Permissions')).toBeVisible()
}

const chip = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true })

test.describe('Roles', () => {
  test('creating a role posts to /rbac/roles with an upper-cased name', async ({
    page,
  }) => {
    await signInAsAdmin(page)
    const sent = await mockRbac(page, { permissions: permissions() })

    await page.goto('/access-control/roles')
    // Let the initial role list land first, or it would replace the new row.
    await expect(page.getByText('ANALYST')).toBeVisible()
    await page.getByRole('button', { name: 'Add Role' }).click()
    await page.getByPlaceholder('e.g. PORTFOLIO_MANAGER').fill('trader_desk')
    await page
      .getByPlaceholder('Role description...')
      .fill('Trades on the desk')
    await page.getByRole('button', { name: 'Add Role' }).last().click()

    await expect(page.getByText('TRADER_DESK', { exact: true })).toBeVisible()
    expect(sent).toEqual([
      {
        method: 'POST',
        url: '/roles',
        body: { name: 'TRADER_DESK', description: 'Trades on the desk' },
      },
    ])
  })

  test('unticking a permission revokes it instead of silently doing nothing', async ({
    page,
  }) => {
    await signInAsAdmin(page)
    const sent = await mockRbac(page, { permissions: permissions() })

    await openPermissions(page, 'ANALYST')
    await chip(page, 'write').first().click() // core_app: write
    await page.getByRole('button', { name: 'Save Matrix' }).click()

    await expect.poll(() => sent.length).toBe(1)
    expect(sent[0]).toEqual({
      method: 'DELETE',
      url: '/revoke-permissions',
      body: {
        roleId: 'role-analyst',
        permissions: [{ resourceName: 'core_app', actions: ['write'] }],
      },
    })
  })

  test('a mixed edit assigns what was added first, then revokes what was removed', async ({
    page,
  }) => {
    await signInAsAdmin(page)
    const sent = await mockRbac(page, { permissions: permissions(['write']) })

    await openPermissions(page, 'ANALYST')
    await chip(page, 'write').first().click() // untick core_app write
    await chip(page, 'write').last().click() // tick role write
    await page.getByRole('button', { name: 'Save Matrix' }).click()

    await expect.poll(() => sent.length).toBe(2)
    expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([
      'POST /assign-permissions',
      'DELETE /revoke-permissions',
    ])
    expect(sent[0].body).toMatchObject({
      permissions: [{ resourceName: 'role', actions: ['write'] }],
    })
    expect(sent[1].body).toMatchObject({
      permissions: [{ resourceName: 'core_app', actions: ['write'] }],
    })
  })

  test('saving without changes says so and calls nothing', async ({ page }) => {
    await signInAsAdmin(page)
    const sent = await mockRbac(page, { permissions: permissions() })

    await openPermissions(page, 'ANALYST')
    await page.getByRole('button', { name: 'Save Matrix' }).click()

    await expect(page.getByText('No changes to save.')).toBeVisible()
    expect(sent).toEqual([])
  })

  test('an action the resource supports but has no permission for can be enabled, then assigned', async ({
    page,
  }) => {
    await signInAsAdmin(page)
    const sent = await mockRbac(page, { permissions: permissions() })

    await openPermissions(page, 'ANALYST')
    await expect(
      page.getByRole('button', { name: /Enable delete/ }),
    ).toBeVisible()
    await page.getByRole('button', { name: /Enable write/ }).click()

    await expect.poll(() => sent.length).toBe(1)
    expect(sent[0]).toEqual({
      method: 'POST',
      url: '/resource-mappings',
      body: { resources: [{ name: 'role', actions: ['write'] }] },
    })
    // The new permission is now a normal, assignable chip.
    await expect(
      page.getByRole('button', { name: /Enable write/ }),
    ).toHaveCount(0)
    await expect(chip(page, 'write')).toHaveCount(2)
  })
})

const users = () => [
  {
    id: 'user-a',
    displayName: 'Alice',
    email: 'alice@example.com',
    status: 'ACTIVE',
    createdAt: '2030-01-01T10:00:00.000Z',
    userRoles: [{ role: { id: 'role-analyst', name: 'ANALYST' } }],
  },
]

const mockUsers = async (page: Page) => {
  const sent: Recorded[] = []
  await page.route('**/api/v1/rbac/users*', (route) =>
    route.fulfill({ status: 200, json: { success: true, data: users() } }),
  )
  await page.route('**/api/v1/rbac/roles', (route) =>
    route.fulfill({ status: 200, json: { success: true, data: roles() } }),
  )
  await page.route('**/api/v1/rbac/roles/*', (route) => {
    const req = route.request()
    sent.push({
      method: req.method(),
      url: new URL(req.url()).pathname,
      body: req.postDataJSON(),
    })
    return route.fulfill({ status: 200, json: { success: true } })
  })
  await page.route('**/api/v1/rbac/assign-role', (route) => {
    const body = route.request().postDataJSON() as { roleIds: string[] }
    sent.push({ method: 'POST', url: '/assign-role', body })
    return route.fulfill({
      status: 200,
      json: {
        success: true,
        data: {
          userId: 'user-a',
          userName: 'Alice',
          roles: roles().filter((r) => body.roleIds.includes(r.id)),
        },
      },
    })
  })
  return sent
}

test.describe('Users', () => {
  test('taking away every role revokes each one, since assigning needs at least one', async ({
    page,
  }) => {
    await signInAsAdmin(page)
    const sent = await mockUsers(page)

    await page.goto('/access-control/users')
    await page.getByRole('button', { name: 'Edit Roles' }).click()
    await page.getByRole('button', { name: /ANALYST/ }).click() // untick the only role
    await page.getByRole('button', { name: 'Save Changes' }).click()

    await expect.poll(() => sent.length).toBe(1)
    expect(sent[0]).toEqual({
      method: 'DELETE',
      url: '/api/v1/rbac/roles/role-analyst',
      body: { userId: 'user-a', roleId: 'role-analyst' },
    })
    await expect(page.getByText('No roles')).toBeVisible()
  })

  test('changing to another role still replaces the set in one assign call', async ({
    page,
  }) => {
    await signInAsAdmin(page)
    const sent = await mockUsers(page)

    await page.goto('/access-control/users')
    await page.getByRole('button', { name: 'Edit Roles' }).click()
    await page.getByRole('button', { name: /VIEWER/ }).click()
    await page.getByRole('button', { name: 'Save Changes' }).click()

    await expect.poll(() => sent.length).toBe(1)
    expect(sent[0]).toEqual({
      method: 'POST',
      url: '/assign-role',
      body: { userId: 'user-a', roleIds: ['role-analyst', 'role-viewer'] },
    })
  })
})
