jest.mock('../admin-service', () => ({
  changeMemberRole: jest.fn(),
  transferOwnership: jest.fn(),
  leaveTeam: jest.fn(),
  listInvites: jest.fn(),
  revokeInvite: jest.fn(),
  resendInvite: jest.fn(),
  renameTeam: jest.fn(),
  deleteTeam: jest.fn(),
  exportTeam: jest.fn(),
  updateBillingContact: jest.fn(),
  scheduleSeatReduction: jest.fn(),
  cancelSeatReduction: jest.fn(),
  listAuditLog: jest.fn(),
}))
jest.mock('../service', () => ({}))
jest.mock('../workspace-service', () => ({}))

import { ValidationError } from '../../../shared/errors'
import * as Admin from '../admin-service'
import * as controller from '../controller'

const UUID = '123e4567-e89b-12d3-a456-426614174000'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  return res
}
const mockReq = (overrides: Record<string, any> = {}) =>
  ({
    user: { userId: 'user-1' },
    body: {},
    query: {},
    params: {},
    ...overrides,
  }) as any
const next = jest.fn()

beforeEach(() => jest.resetAllMocks())

describe('members and ownership', () => {
  it('changeMemberRole validates the role and passes the target', async () => {
    ;(Admin.changeMemberRole as jest.Mock).mockResolvedValue({
      userId: UUID,
      role: 'ADMIN',
    })
    const res = mockRes()
    await controller.changeMemberRole(
      mockReq({ params: { userId: UUID }, body: { role: 'ADMIN' } }),
      res,
      next,
    )
    expect(Admin.changeMemberRole).toHaveBeenCalledWith('user-1', UUID, 'ADMIN')
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Role updated',
      data: { userId: UUID, role: 'ADMIN' },
    })
  })

  it.each(['OWNER', 'SUPERUSER', undefined])(
    'changeMemberRole refuses the role %s before any service call',
    async (role) => {
      await controller.changeMemberRole(
        mockReq({ params: { userId: UUID }, body: { role } }),
        mockRes(),
        next,
      )
      expect(next).toHaveBeenCalledWith(expect.any(ValidationError))
      expect(Admin.changeMemberRole).not.toHaveBeenCalled()
    },
  )

  it('transferOwnership needs a valid user id', async () => {
    await controller.transferOwnership(
      mockReq({ body: { userId: 'nope' } }),
      mockRes(),
      next,
    )
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError))

    const res = mockRes()
    await controller.transferOwnership(
      mockReq({ body: { userId: UUID } }),
      res,
      jest.fn(),
    )
    expect(Admin.transferOwnership).toHaveBeenCalledWith('user-1', UUID)
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Ownership transferred',
    })
  })

  it('leaveTeam responds without data', async () => {
    const res = mockRes()
    await controller.leaveTeam(mockReq(), res, next)
    expect(Admin.leaveTeam).toHaveBeenCalledWith('user-1')
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'You left the workspace',
    })
  })
})

describe('invites', () => {
  it('listInvites returns the list', async () => {
    ;(Admin.listInvites as jest.Mock).mockResolvedValue([{ id: 'i1' }])
    const res = mockRes()
    await controller.listInvites(mockReq(), res, next)
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Invites fetched',
      data: [{ id: 'i1' }],
    })
  })

  it('revokeInvite and resendInvite validate the id param', async () => {
    await controller.revokeInvite(
      mockReq({ params: { id: 'bad' } }),
      mockRes(),
      next,
    )
    await controller.resendInvite(
      mockReq({ params: { id: 'bad' } }),
      mockRes(),
      next,
    )
    expect(next).toHaveBeenCalledTimes(2)
    expect(Admin.revokeInvite).not.toHaveBeenCalled()
    expect(Admin.resendInvite).not.toHaveBeenCalled()
  })

  it('revokeInvite and resendInvite call the service', async () => {
    ;(Admin.resendInvite as jest.Mock).mockResolvedValue({ inviteLink: 'x' })
    const res = mockRes()
    await controller.resendInvite(mockReq({ params: { id: UUID } }), res, next)
    await controller.revokeInvite(
      mockReq({ params: { id: UUID } }),
      mockRes(),
      next,
    )
    expect(Admin.resendInvite).toHaveBeenCalledWith('user-1', UUID)
    expect(Admin.revokeInvite).toHaveBeenCalledWith('user-1', UUID)
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Invite resent',
      data: { inviteLink: 'x' },
    })
  })
})

describe('workspace lifecycle', () => {
  it('renameTeam validates and returns the new name', async () => {
    ;(Admin.renameTeam as jest.Mock).mockResolvedValue({ id: 't', name: 'New' })
    const res = mockRes()
    await controller.renameTeam(mockReq({ body: { name: 'New' } }), res, next)
    expect(Admin.renameTeam).toHaveBeenCalledWith('user-1', 'New')
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Workspace renamed',
      data: { id: 't', name: 'New' },
    })
  })

  it('renameTeam rejects a blank name', async () => {
    await controller.renameTeam(
      mockReq({ body: { name: '  ' } }),
      mockRes(),
      next,
    )
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError))
    expect(Admin.renameTeam).not.toHaveBeenCalled()
  })

  it('deleteTeam requires the confirmation name', async () => {
    await controller.deleteTeam(mockReq({ body: {} }), mockRes(), next)
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError))

    const res = mockRes()
    await controller.deleteTeam(
      mockReq({ body: { confirmName: 'Alpha Fund' } }),
      res,
      jest.fn(),
    )
    expect(Admin.deleteTeam).toHaveBeenCalledWith('user-1', 'Alpha Fund')
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Workspace deleted',
    })
  })

  it('exportTeam sends an uncached JSON download, not an envelope', async () => {
    ;(Admin.exportTeam as jest.Mock).mockResolvedValue({ team: { id: 't' } })
    const res = mockRes()
    await controller.exportTeam(mockReq(), res, next)

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="workspace-export.json"',
    )
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ team: { id: 't' } })
  })

  it('exportTeam forwards errors', async () => {
    const error = new Error('no')
    ;(Admin.exportTeam as jest.Mock).mockRejectedValue(error)
    const res = mockRes()
    await controller.exportTeam(mockReq(), res, next)
    expect(next).toHaveBeenCalledWith(error)
    expect(res.json).not.toHaveBeenCalled()
  })
})

describe('billing contact and seat reduction', () => {
  it('updateBillingContact accepts an email or null and rejects garbage', async () => {
    ;(Admin.updateBillingContact as jest.Mock).mockResolvedValue({
      billingEmail: 'b@fund.com',
    })
    await controller.updateBillingContact(
      mockReq({ body: { billingEmail: ' B@Fund.com ' } }),
      mockRes(),
      next,
    )
    expect(Admin.updateBillingContact).toHaveBeenCalledWith(
      'user-1',
      'b@fund.com',
    )

    await controller.updateBillingContact(
      mockReq({ body: { billingEmail: null } }),
      mockRes(),
      next,
    )
    expect(Admin.updateBillingContact).toHaveBeenLastCalledWith('user-1', null)

    await controller.updateBillingContact(
      mockReq({ body: { billingEmail: 'nope' } }),
      mockRes(),
      next,
    )
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError))
  })

  it.each([1, 151, 2.5, '5'])(
    'scheduleSeatReduction rejects seatCount %s',
    async (seatCount) => {
      await controller.scheduleSeatReduction(
        mockReq({ body: { seatCount } }),
        mockRes(),
        next,
      )
      expect(next).toHaveBeenCalledWith(expect.any(ValidationError))
      expect(Admin.scheduleSeatReduction).not.toHaveBeenCalled()
    },
  )

  it('scheduleSeatReduction and cancelSeatReduction call the service', async () => {
    ;(Admin.scheduleSeatReduction as jest.Mock).mockResolvedValue({
      seatCapacity: 10,
      scheduledSeatCapacity: 6,
    })
    const res = mockRes()
    await controller.scheduleSeatReduction(
      mockReq({ body: { seatCount: 6 } }),
      res,
      next,
    )
    expect(Admin.scheduleSeatReduction).toHaveBeenCalledWith('user-1', 6)

    ;(Admin.cancelSeatReduction as jest.Mock).mockResolvedValue({
      seatCapacity: 10,
      scheduledSeatCapacity: null,
    })
    const cancelRes = mockRes()
    await controller.cancelSeatReduction(mockReq(), cancelRes, next)
    expect(cancelRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Seat reduction cancelled',
      data: { seatCapacity: 10, scheduledSeatCapacity: null },
    })
  })
})

describe('listAuditLog', () => {
  it('applies query defaults and forwards the filter', async () => {
    ;(Admin.listAuditLog as jest.Mock).mockResolvedValue({
      entries: [],
      nextCursor: null,
    })
    const res = mockRes()
    await controller.listAuditLog(
      mockReq({ query: { action: 'ROLE_CHANGED' } }),
      res,
      next,
    )
    expect(Admin.listAuditLog).toHaveBeenCalledWith('user-1', {
      limit: 25,
      action: 'ROLE_CHANGED',
    })
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Audit log fetched',
      data: { entries: [], nextCursor: null },
    })
  })

  it.each([
    { limit: '0' },
    { limit: '101' },
    { cursor: 'not-a-uuid' },
    { action: 'NOT_AN_ACTION' },
  ])('rejects the query %o', async (query) => {
    await controller.listAuditLog(mockReq({ query }), mockRes(), next)
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError))
    expect(Admin.listAuditLog).not.toHaveBeenCalled()
  })
})
