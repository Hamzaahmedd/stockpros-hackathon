jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    role: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    resource: { findMany: jest.fn(), findUnique: jest.fn() },
    permission: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      createMany: jest.fn(),
      create: jest.fn(),
    },
    rolePermission: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    userRole: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('../../../shared/infrastructure/cache', () => ({
  getCache: jest.fn(),
  setCache: jest.fn(),
  deleteCache: jest.fn(),
}))

import { prisma } from '../../../shared/infrastructure/database'
import {
  getCache,
  setCache,
  deleteCache,
} from '../../../shared/infrastructure/cache'
import {
  assignPermissions,
  checkPermission,
  createRole,
  fetchAllPermissions,
  fetchAllResources,
  fetchAllRoles,
  fetchAllScreenPermissions,
  fetchAllUsers,
  getUserPermissions,
  grantActionsToResources,
  grantRole,
  revokePermissions,
  unassignRole,
} from '../service'
import { Action, Resource } from '../permissions'

const mockPrisma = prisma as unknown as {
  [model: string]: Record<string, jest.Mock>
} & { $transaction: jest.Mock }

beforeEach(() => {
  jest.clearAllMocks()
  ;(getCache as jest.Mock).mockResolvedValue(null)
  ;(setCache as jest.Mock).mockResolvedValue(undefined)
  ;(deleteCache as jest.Mock).mockResolvedValue(undefined)
  // Every $transaction callsite in service.ts only calls tx.<model>.<method>,
  // which is the same shape as the top-level prisma mock, so replaying the
  // callback against `prisma` itself is a faithful stand-in for a real tx.
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: unknown) => unknown) => fn(prisma),
  )
})

describe('getUserPermissions', () => {
  it('returns the cached actions without querying the database on a cache hit', async () => {
    ;(getCache as jest.Mock).mockResolvedValue(['read', 'write'])

    const result = await getUserPermissions('user-1', Resource.PORTFOLIO)

    expect(result).toEqual(['read', 'write'])
    expect(mockPrisma.userRole.findMany).not.toHaveBeenCalled()
  })

  it('returns the actions granted to the user through their assigned roles', async () => {
    mockPrisma.userRole.findMany.mockResolvedValue([{ roleId: 'role-1' }])
    mockPrisma.rolePermission.findMany.mockResolvedValue([
      {
        permission: {
          action: Action.READ,
          resource: { name: Resource.PORTFOLIO },
        },
      },
      {
        permission: {
          action: Action.WRITE,
          resource: { name: Resource.PORTFOLIO },
        },
      },
    ])

    const result = await getUserPermissions('user-1', Resource.PORTFOLIO)

    expect(result.sort()).toEqual([Action.READ, Action.WRITE].sort())
    expect(setCache).toHaveBeenCalledWith(
      'user:user-1:resource:portfolio',
      expect.arrayContaining([Action.READ, Action.WRITE]),
      expect.any(Number),
    )
  })

  it("dedupes an action granted redundantly by more than one of the user's roles", async () => {
    mockPrisma.userRole.findMany.mockResolvedValue([
      { roleId: 'role-1' },
      { roleId: 'role-2' },
    ])
    mockPrisma.rolePermission.findMany.mockResolvedValue([
      {
        permission: {
          action: Action.READ,
          resource: { name: Resource.PORTFOLIO },
        },
      },
      {
        permission: {
          action: Action.READ,
          resource: { name: Resource.PORTFOLIO },
        },
      },
    ])

    const result = await getUserPermissions('user-1', Resource.PORTFOLIO)

    expect(result).toEqual([Action.READ])
  })

  it('ignores permissions belonging to a different resource', async () => {
    mockPrisma.userRole.findMany.mockResolvedValue([{ roleId: 'role-1' }])
    mockPrisma.rolePermission.findMany.mockResolvedValue([
      {
        permission: {
          action: Action.WRITE,
          resource: { name: Resource.CORE_APP },
        },
      },
    ])

    const result = await getUserPermissions('user-1', Resource.PORTFOLIO)

    expect(result).toEqual([])
  })

  it('returns no permissions for a user with no role assigned, without querying role permissions', async () => {
    mockPrisma.userRole.findMany.mockResolvedValue([])

    const result = await getUserPermissions('user-1', Resource.PORTFOLIO)

    expect(result).toEqual([])
    expect(mockPrisma.rolePermission.findMany).not.toHaveBeenCalled()
  })
})

describe('checkPermission', () => {
  it("returns true when the requested action is among the user's allowed actions", async () => {
    ;(getCache as jest.Mock).mockResolvedValue([Action.READ, Action.WRITE])

    await expect(
      checkPermission('user-1', Resource.PORTFOLIO, Action.WRITE),
    ).resolves.toBe(true)
  })

  it('returns false when the requested action is not among the allowed actions', async () => {
    ;(getCache as jest.Mock).mockResolvedValue([Action.READ])

    await expect(
      checkPermission('user-1', Resource.PORTFOLIO, Action.DELETE),
    ).resolves.toBe(false)
  })
})

describe('assignPermissions', () => {
  const baseParams = {
    roleId: 'role-1',
    callerId: 'caller-1',
    permissions: [
      {
        resourceName: Resource.PORTFOLIO,
        actions: [Action.WRITE, Action.READ],
      },
    ],
  }

  beforeEach(() => {
    mockPrisma.role.findUnique.mockResolvedValue({
      id: 'role-1',
      name: 'ADMIN',
    })
    mockPrisma.resource.findMany.mockResolvedValue([
      { id: 'resource-1', name: Resource.PORTFOLIO },
    ])
    mockPrisma.permission.findMany.mockResolvedValue([
      { action: Action.WRITE, resourceId: 'resource-1' },
      { action: Action.READ, resourceId: 'resource-1' },
    ])
    mockPrisma.rolePermission.findMany.mockResolvedValue([])
    mockPrisma.userRole.findMany.mockResolvedValue([])
  })

  it('throws when the target role does not exist', async () => {
    mockPrisma.role.findUnique.mockResolvedValue(null)

    await expect(assignPermissions(baseParams)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('rejects a write grant that does not also include read', async () => {
    await expect(
      assignPermissions({
        ...baseParams,
        permissions: [
          { resourceName: Resource.PORTFOLIO, actions: [Action.WRITE] },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('throws when the named resource does not exist', async () => {
    mockPrisma.resource.findMany.mockResolvedValue([])

    await expect(assignPermissions(baseParams)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('throws when the action is not a supported action for the resource', async () => {
    await expect(
      assignPermissions({
        ...baseParams,
        permissions: [
          {
            resourceName: Resource.PORTFOLIO,
            actions: [Action.DELETE, Action.READ],
          },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('throws when the permission row is not defined for that resource/action pair', async () => {
    mockPrisma.permission.findMany.mockResolvedValue([
      { action: Action.READ, resourceId: 'resource-1' },
    ])

    await expect(assignPermissions(baseParams)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it("assigns the permissions and invalidates every current assignee's cache", async () => {
    // permission.findMany is called twice: once as `existingPermissions`
    // (outside the transaction, to validate the requested action/resource
    // pairs are defined) and once as `dbPermissions` (inside the
    // transaction, to fetch the ids to link). rolePermission.findMany is
    // called once, for the final read-back after linking.
    mockPrisma.permission.findMany
      .mockResolvedValueOnce([
        { action: Action.WRITE, resourceId: 'resource-1' },
        { action: Action.READ, resourceId: 'resource-1' },
      ])
      .mockResolvedValueOnce([
        { id: 'perm-write', action: Action.WRITE, resourceId: 'resource-1' },
        { id: 'perm-read', action: Action.READ, resourceId: 'resource-1' },
      ])
    mockPrisma.rolePermission.findMany.mockResolvedValue([
      {
        permissionId: 'perm-write',
        permission: {
          action: Action.WRITE,
          resource: { name: Resource.PORTFOLIO },
        },
      },
      {
        permissionId: 'perm-read',
        permission: {
          action: Action.READ,
          resource: { name: Resource.PORTFOLIO },
        },
      },
    ])
    mockPrisma.userRole.findMany.mockResolvedValue([{ userId: 'user-1' }])

    const result = await assignPermissions(baseParams)

    expect(result).toEqual({
      roleId: 'role-1',
      roleName: 'ADMIN',
      permissions: [
        {
          id: 'perm-write',
          action: Action.WRITE,
          resource: Resource.PORTFOLIO,
        },
        { id: 'perm-read', action: Action.READ, resource: Resource.PORTFOLIO },
      ],
    })
    expect(mockPrisma.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { roleId: 'role-1' },
    })
    expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
      data: [
        { roleId: 'role-1', permissionId: 'perm-write' },
        { roleId: 'role-1', permissionId: 'perm-read' },
      ],
    })
    expect(deleteCache).toHaveBeenCalledWith('user:user-1:resource:portfolio')
  })
})

describe('revokePermissions', () => {
  const baseParams = {
    roleId: 'role-1',
    callerId: 'caller-1',
    permissions: [
      { resourceName: Resource.PORTFOLIO, actions: [Action.WRITE] },
    ],
  }

  beforeEach(() => {
    mockPrisma.resource.findMany.mockResolvedValue([
      { id: 'resource-1', name: Resource.PORTFOLIO },
    ])
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-1' })
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'caller-1' })
    mockPrisma.rolePermission.findMany.mockResolvedValue([
      {
        permission: {
          action: Action.WRITE,
          resource: { name: Resource.PORTFOLIO },
        },
      },
      {
        permission: {
          action: Action.READ,
          resource: { name: Resource.PORTFOLIO },
        },
      },
    ])
    mockPrisma.permission.findUnique.mockResolvedValue({ id: 'perm-write' })
    mockPrisma.userRole.findMany.mockResolvedValue([])
  })

  it('throws when a named resource does not exist', async () => {
    mockPrisma.resource.findMany.mockResolvedValue([])

    await expect(revokePermissions(baseParams)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('throws when the role does not exist', async () => {
    mockPrisma.role.findUnique.mockResolvedValue(null)

    await expect(revokePermissions(baseParams)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('throws when the calling grantor does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)

    await expect(revokePermissions(baseParams)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('refuses to revoke read while a write/delete grant would be left without it', async () => {
    await expect(
      revokePermissions({
        ...baseParams,
        permissions: [
          { resourceName: Resource.PORTFOLIO, actions: [Action.READ] },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(mockPrisma.rolePermission.deleteMany).not.toHaveBeenCalled()
  })

  it("revokes the permission and invalidates every current assignee's cache", async () => {
    mockPrisma.userRole.findMany.mockResolvedValue([{ userId: 'user-1' }])

    await revokePermissions(baseParams)

    expect(mockPrisma.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { roleId: 'role-1', permissionId: 'perm-write' },
    })
    expect(deleteCache).toHaveBeenCalledWith('user:user-1:resource:portfolio')
  })
})

describe('grantRole', () => {
  it('throws when the target user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.role.findMany.mockResolvedValue([])

    await expect(
      grantRole({
        userId: 'user-1',
        roleIds: ['role-1'],
        callerId: 'caller-1',
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('throws when one or more role ids do not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      displayName: 'A',
    })
    mockPrisma.role.findMany.mockResolvedValue([{ id: 'role-1' }])

    await expect(
      grantRole({
        userId: 'user-1',
        roleIds: ['role-1', 'role-2'],
        callerId: 'caller-1',
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it("replaces the user's roles and invalidates their permission cache", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      displayName: 'A',
    })
    mockPrisma.role.findMany.mockResolvedValue([{ id: 'role-1' }])
    mockPrisma.userRole.findMany.mockResolvedValue([
      { role: { id: 'role-1', name: 'ADMIN' } },
    ])
    mockPrisma.resource.findMany.mockResolvedValue([
      { name: Resource.PORTFOLIO },
    ])

    const result = await grantRole({
      userId: 'user-1',
      roleIds: ['role-1'],
      callerId: 'caller-1',
    })

    expect(mockPrisma.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
    expect(mockPrisma.userRole.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', roleId: 'role-1', assignedById: 'caller-1' }],
    })
    expect(result.roles).toEqual([{ id: 'role-1', name: 'ADMIN' }])
    expect(deleteCache).toHaveBeenCalledWith(
      'user:user-1:screens:effective:all',
    )
  })
})

describe('unassignRole', () => {
  const baseParams = {
    userId: 'user-1',
    roleId: 'role-1',
    revokedByUserId: 'caller-1',
  }

  beforeEach(() => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-1' })
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'caller-1' })
    mockPrisma.userRole.findFirst.mockResolvedValue({ id: 'user-role-1' })
    mockPrisma.userRole.findMany.mockResolvedValue([
      { roleId: 'role-role-delete' },
    ])
    mockPrisma.rolePermission.findMany.mockResolvedValue([
      {
        permission: {
          action: Action.DELETE,
          resource: { name: Resource.ROLE },
        },
      },
    ])
  })

  it('throws NotFoundError when the role, revoker, or target user is missing', async () => {
    mockPrisma.role.findUnique.mockResolvedValue(null)

    await expect(unassignRole(baseParams)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('throws UnauthorizedError when the caller lacks ROLE:DELETE authority', async () => {
    mockPrisma.rolePermission.findMany.mockResolvedValue([])

    await expect(unassignRole(baseParams)).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('throws NotFoundError when the user does not currently have this role', async () => {
    mockPrisma.userRole.findFirst.mockResolvedValue(null)

    await expect(unassignRole(baseParams)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it("removes the role assignment and invalidates the target user's cache", async () => {
    mockPrisma.userRole.delete.mockResolvedValue({ id: 'user-role-1' })
    mockPrisma.resource.findMany.mockResolvedValue([
      { name: Resource.PORTFOLIO },
    ])

    await unassignRole(baseParams)

    expect(mockPrisma.userRole.delete).toHaveBeenCalledWith({
      where: { id: 'user-role-1' },
    })
    expect(deleteCache).toHaveBeenCalledWith(
      'user:user-1:screens:effective:all',
    )
  })
})

describe('createRole', () => {
  it('normalizes the role name to uppercase before creating it', async () => {
    mockPrisma.role.create.mockResolvedValue({ id: 'role-1', name: 'ANALYST' })

    await createRole({ name: 'analyst', description: 'Read-only analyst' })

    expect(mockPrisma.role.create).toHaveBeenCalledWith({
      data: { name: 'ANALYST', description: 'Read-only analyst' },
    })
  })
})

describe('grantActionsToResources', () => {
  it('throws when a named resource does not exist', async () => {
    mockPrisma.resource.findUnique.mockResolvedValue(null)

    await expect(
      grantActionsToResources([
        { name: Resource.PORTFOLIO, actions: [Action.READ] },
      ]),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('throws when an action is not supported for the resource', async () => {
    mockPrisma.resource.findUnique.mockResolvedValue({ id: 'resource-1' })

    await expect(
      grantActionsToResources([
        { name: Resource.ACCESS_CONTROL, actions: [Action.DELETE] },
      ]),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('creates only the permissions that do not already exist, and skips the rest', async () => {
    mockPrisma.resource.findUnique.mockResolvedValue({ id: 'resource-1' })
    mockPrisma.permission.findUnique
      .mockResolvedValueOnce({ id: 'existing-read' }) // READ already exists
      .mockResolvedValueOnce(null) // WRITE does not exist yet

    const result = await grantActionsToResources([
      { name: Resource.PORTFOLIO, actions: [Action.READ, Action.WRITE] },
    ])

    expect(mockPrisma.permission.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.permission.create).toHaveBeenCalledWith({
      data: { action: Action.WRITE, resourceId: 'resource-1' },
    })
    expect(result).toEqual({ [Resource.PORTFOLIO]: [Action.WRITE] })
  })
})

describe('fetchAllScreenPermissions', () => {
  it('returns the cached result without touching the database on a cache hit', async () => {
    ;(getCache as jest.Mock).mockResolvedValue({ PORTFOLIO: { canRead: true } })

    const result = await fetchAllScreenPermissions('user-1')

    expect(result).toEqual({ PORTFOLIO: { canRead: true } })
    expect(mockPrisma.userRole.findFirst).not.toHaveBeenCalled()
  })

  it('caches and returns an empty object for a user with no role assigned', async () => {
    mockPrisma.userRole.findFirst.mockResolvedValue(null)

    const result = await fetchAllScreenPermissions('user-1')

    expect(result).toEqual({})
    expect(setCache).toHaveBeenCalledWith(
      'user:user-1:screens:effective:all',
      {},
      expect.any(Number),
    )
  })

  it('omits a resource the user cannot read, and only includes write/delete alongside read', async () => {
    mockPrisma.userRole.findFirst.mockResolvedValue({ roleId: 'role-1' })
    mockPrisma.resource.findMany.mockResolvedValue([
      { id: 'r1', name: Resource.PORTFOLIO },
      { id: 'r2', name: Resource.ROLE },
    ])
    mockPrisma.userRole.findMany.mockResolvedValue([{ roleId: 'role-1' }])
    mockPrisma.rolePermission.findMany.mockImplementation(
      async ({ where }: any) => {
        if (where.roleId?.in?.includes('role-1') === false) return []
        return [
          {
            permission: {
              action: Action.READ,
              resource: { name: Resource.PORTFOLIO },
            },
          },
          {
            permission: {
              action: Action.WRITE,
              resource: { name: Resource.PORTFOLIO },
            },
          },
        ]
      },
    )

    const result = await fetchAllScreenPermissions('user-1')

    expect(result).toEqual({
      PORTFOLIO: { canRead: true, canWrite: true },
    })
    expect(result).not.toHaveProperty('ROLE')
  })
})

describe('fetchAllUsers', () => {
  it('paginates by createdAt/id cursor and reports hasMore when a page is full', async () => {
    mockPrisma.user.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({
        id: `user-${i}`,
        createdAt: new Date(2024, 0, i + 1),
      })),
    )
    mockPrisma.user.count.mockResolvedValue(10)

    const result = await fetchAllUsers({ limit: 2 })

    expect(result.data).toHaveLength(2)
    expect(result.hasMore).toBe(true)
    expect(result.nextCursor).toBe('user-1')
    expect(result.total).toBe(10)
  })

  it('resolves the cursor row and filters strictly before its (createdAt, id)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      createdAt: new Date(2024, 0, 5),
    })
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-a', createdAt: new Date(2024, 0, 4) },
    ])
    mockPrisma.user.count.mockResolvedValue(5)

    await fetchAllUsers({ cursor: 'user-cursor', limit: 20 })

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-cursor' },
      select: { createdAt: true },
    })
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { createdAt: { lt: new Date(2024, 0, 5) } },
            { createdAt: new Date(2024, 0, 5), id: { lt: 'user-cursor' } },
          ],
        }),
      }),
    )
  })

  it('ignores an unresolvable cursor id and paginates from the start', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.user.findMany.mockResolvedValue([])
    mockPrisma.user.count.mockResolvedValue(0)

    await fetchAllUsers({ cursor: 'missing-user', limit: 20 })

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    )
  })

  it('reports hasMore=false and a null cursor on the last page', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-0', createdAt: new Date() },
    ])
    mockPrisma.user.count.mockResolvedValue(1)

    const result = await fetchAllUsers({ limit: 20 })

    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeNull()
  })
})

describe('fetchAllRoles / fetchAllPermissions / fetchAllResources', () => {
  it('fetchAllRoles throws NotFoundError when no roles exist', async () => {
    mockPrisma.role.findMany.mockResolvedValue([])

    await expect(fetchAllRoles()).rejects.toMatchObject({ statusCode: 404 })
  })

  it('fetchAllRoles maps _count.userRoles onto userCount and drops _count', async () => {
    mockPrisma.role.findMany.mockResolvedValue([
      {
        id: 'role-1',
        name: 'ADMIN',
        _count: { userRoles: 4 },
        rolePermissions: [],
      },
    ])

    const result = await fetchAllRoles()

    expect(result).toEqual([
      {
        id: 'role-1',
        name: 'ADMIN',
        _count: undefined,
        userCount: 4,
        rolePermissions: [],
      },
    ])
  })

  it('fetchAllResources returns the resources as-is when any exist', async () => {
    mockPrisma.resource.findMany.mockResolvedValue([
      { id: 'r1', name: Resource.PORTFOLIO },
    ])

    await expect(fetchAllResources()).resolves.toEqual([
      { id: 'r1', name: Resource.PORTFOLIO },
    ])
  })

  it('fetchAllPermissions filters out permissions for actions no longer supported by their resource', async () => {
    mockPrisma.permission.findMany.mockResolvedValue([
      {
        id: 'p1',
        action: Action.READ,
        resourceId: 'r1',
        resource: { name: Resource.PORTFOLIO },
      },
      {
        id: 'p2',
        action: Action.DELETE,
        resourceId: 'r1',
        resource: { name: Resource.PORTFOLIO },
      },
    ])

    const result = await fetchAllPermissions()

    expect(result).toEqual([
      {
        id: 'p1',
        action: Action.READ,
        resourceId: 'r1',
        resource: { name: Resource.PORTFOLIO },
      },
    ])
  })

  it('fetchAllPermissions throws NotFoundError when every permission is filtered out', async () => {
    mockPrisma.permission.findMany.mockResolvedValue([
      {
        id: 'p2',
        action: Action.DELETE,
        resourceId: 'r1',
        resource: { name: Resource.PORTFOLIO },
      },
    ])

    await expect(fetchAllPermissions()).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('fetchAllResources throws NotFoundError when no resources exist', async () => {
    mockPrisma.resource.findMany.mockResolvedValue([])

    await expect(fetchAllResources()).rejects.toMatchObject({ statusCode: 404 })
  })
})
