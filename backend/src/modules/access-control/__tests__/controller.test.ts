jest.mock('../service', () => ({
  fetchAllPermissions: jest.fn(),
  fetchAllResources: jest.fn(),
  fetchAllRoles: jest.fn(),
  fetchAllScreenPermissions: jest.fn(),
  fetchAllUsers: jest.fn(),
  grantRole: jest.fn(),
  unassignRole: jest.fn(),
  createRole: jest.fn(),
  assignPermissions: jest.fn(),
  revokePermissions: jest.fn(),
  grantActionsToResources: jest.fn(),
}))

import {
  fetchAllPermissions,
  fetchAllResources,
  fetchAllRoles,
  fetchAllScreenPermissions,
  fetchAllUsers,
  grantRole,
  unassignRole,
  createRole,
  assignPermissions,
  revokePermissions,
  grantActionsToResources,
} from '../service'
import * as controller from '../controller'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}
const mockReq = (overrides: Record<string, any> = {}) => ({
  user: { userId: 'caller-1' },
  body: {},
  query: {},
  ...overrides,
})
const next = jest.fn()

beforeEach(() => jest.clearAllMocks())

describe('getUserScreenPermissions', () => {
  it("returns the caller's permissions", async () => {
    ;(fetchAllScreenPermissions as jest.Mock).mockResolvedValue({
      PORTFOLIO: {},
    })
    const res = mockRes()
    await controller.getUserScreenPermissions(mockReq() as any, res, next)
    expect(fetchAllScreenPermissions).toHaveBeenCalledWith('caller-1')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Screen permissions fetched successfully for all resources',
      }),
    )
  })

  it('reports no permissions when the map is empty', async () => {
    ;(fetchAllScreenPermissions as jest.Mock).mockResolvedValue({})
    const res = mockRes()
    await controller.getUserScreenPermissions(mockReq() as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'No permissions assigned to any resource.',
      }),
    )
  })

  it('forwards a downstream failure to next()', async () => {
    ;(fetchAllScreenPermissions as jest.Mock).mockRejectedValue(
      new Error('db down'),
    )
    const res = mockRes()
    await controller.getUserScreenPermissions(mockReq() as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getAllUsers', () => {
  it('validates the query and returns paginated users', async () => {
    ;(fetchAllUsers as jest.Mock).mockResolvedValue({
      data: [{ id: 'u1' }],
      nextCursor: null,
      hasMore: false,
      total: 1,
    })
    const req = mockReq({ query: { limit: '10' } })
    const res = mockRes()
    await controller.getAllUsers(req as any, res, next)
    expect(fetchAllUsers).toHaveBeenCalledWith({ limit: 10 })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ id: 'u1' }], total: 1 }),
    )
  })

  it('rejects an invalid cursor', async () => {
    const req = mockReq({ query: { cursor: 'not-a-uuid' } })
    const res = mockRes()
    await controller.getAllUsers(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getAllPermissions / getAllRoles / getAllResources', () => {
  it('getAllPermissions returns the permission list', async () => {
    ;(fetchAllPermissions as jest.Mock).mockResolvedValue([{ id: 'p1' }])
    const res = mockRes()
    await controller.getAllPermissions(mockReq() as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ id: 'p1' }] }),
    )
  })

  it('getAllPermissions forwards a failure to next()', async () => {
    ;(fetchAllPermissions as jest.Mock).mockRejectedValue(new Error('x'))
    const res = mockRes()
    await controller.getAllPermissions(mockReq() as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })

  it('getAllRoles returns the role list', async () => {
    ;(fetchAllRoles as jest.Mock).mockResolvedValue([{ id: 'r1' }])
    const res = mockRes()
    await controller.getAllRoles(mockReq() as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ id: 'r1' }] }),
    )
  })

  it('getAllRoles forwards a failure to next()', async () => {
    ;(fetchAllRoles as jest.Mock).mockRejectedValue(new Error('x'))
    const res = mockRes()
    await controller.getAllRoles(mockReq() as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })

  it('getAllResources returns the resource list', async () => {
    ;(fetchAllResources as jest.Mock).mockResolvedValue([{ id: 'res1' }])
    const res = mockRes()
    await controller.getAllResources(mockReq() as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ id: 'res1' }] }),
    )
  })

  it('getAllResources forwards a failure to next()', async () => {
    ;(fetchAllResources as jest.Mock).mockRejectedValue(new Error('x'))
    const res = mockRes()
    await controller.getAllResources(mockReq() as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('assignRole', () => {
  const validBody = {
    userId: 'a5b1a111-1111-4111-8111-111111111111',
    roleIds: ['a5b1a111-1111-4111-8111-111111111112'],
  }

  it('assigns the role(s) to the user', async () => {
    ;(grantRole as jest.Mock).mockResolvedValue({ userId: validBody.userId })
    const req = mockReq({ body: validBody })
    const res = mockRes()
    await controller.assignRole(req as any, res, next)
    expect(grantRole).toHaveBeenCalledWith({
      ...validBody,
      callerId: 'caller-1',
    })
  })

  it('rejects a missing userId', async () => {
    const req = mockReq({ body: { roleIds: [validBody.roleIds[0]] } })
    const res = mockRes()
    await controller.assignRole(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('revokeRole', () => {
  const validBody = {
    userId: 'a5b1a111-1111-4111-8111-111111111111',
    roleId: 'a5b1a111-1111-4111-8111-111111111112',
  }

  it('revokes the role from the user', async () => {
    ;(unassignRole as jest.Mock).mockResolvedValue(undefined)
    const req = mockReq({ body: validBody })
    const res = mockRes()
    await controller.revokeRole(req as any, res, next)
    expect(unassignRole).toHaveBeenCalledWith({
      ...validBody,
      revokedByUserId: 'caller-1',
    })
  })

  it('rejects a missing roleId', async () => {
    const req = mockReq({ body: { userId: validBody.userId } })
    const res = mockRes()
    await controller.revokeRole(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('addRole', () => {
  it('creates the role with a 201 status', async () => {
    ;(createRole as jest.Mock).mockResolvedValue({ id: 'role-1' })
    const req = mockReq({
      body: { name: 'SALES_MANAGER', description: 'Manages sales team' },
    })
    const res = mockRes()
    await controller.addRole(req as any, res, next)
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('rejects a role name that is not all-caps snake case', async () => {
    const req = mockReq({
      body: { name: 'sales-manager', description: 'Manages sales team' },
    })
    const res = mockRes()
    await controller.addRole(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('assignPermissionsToRole / revokePermissionsFromRole', () => {
  const validBody = {
    roleId: 'a5b1a111-1111-4111-8111-111111111111',
    permissions: [{ resourceName: 'portfolio', actions: ['read'] }],
  }

  it('assigns permissions to the role', async () => {
    ;(assignPermissions as jest.Mock).mockResolvedValue({
      roleId: validBody.roleId,
    })
    const req = mockReq({ body: validBody })
    const res = mockRes()
    await controller.assignPermissionsToRole(req as any, res, next)
    expect(assignPermissions).toHaveBeenCalledWith({
      ...validBody,
      callerId: 'caller-1',
    })
  })

  it('rejects an empty permissions array', async () => {
    const req = mockReq({ body: { roleId: validBody.roleId, permissions: [] } })
    const res = mockRes()
    await controller.assignPermissionsToRole(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })

  it('revokes permissions from the role', async () => {
    ;(revokePermissions as jest.Mock).mockResolvedValue(undefined)
    const req = mockReq({ body: validBody })
    const res = mockRes()
    await controller.revokePermissionsFromRole(req as any, res, next)
    expect(revokePermissions).toHaveBeenCalledWith({
      ...validBody,
      callerId: 'caller-1',
    })
  })

  it('forwards a downstream revoke failure to next()', async () => {
    ;(revokePermissions as jest.Mock).mockRejectedValue(new Error('conflict'))
    const req = mockReq({ body: validBody })
    const res = mockRes()
    await controller.revokePermissionsFromRole(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('assignActionsToResources', () => {
  it('assigns new actions and reports success', async () => {
    ;(grantActionsToResources as jest.Mock).mockResolvedValue({
      portfolio: ['write'],
    })
    const req = mockReq({
      body: { resources: [{ name: 'portfolio', actions: ['write'] }] },
    })
    const res = mockRes()
    await controller.assignActionsToResources(req as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Actions successfully assigned to resources.',
      }),
    )
  })

  it('reports when nothing new was assigned', async () => {
    ;(grantActionsToResources as jest.Mock).mockResolvedValue({})
    const req = mockReq({
      body: { resources: [{ name: 'portfolio', actions: ['write'] }] },
    })
    const res = mockRes()
    await controller.assignActionsToResources(req as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'No new permissions assigned (all already exist).',
      }),
    )
  })

  it('rejects an empty resources array', async () => {
    const req = mockReq({ body: { resources: [] } })
    const res = mockRes()
    await controller.assignActionsToResources(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
