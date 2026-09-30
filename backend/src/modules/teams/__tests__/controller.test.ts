jest.mock('../service', () => ({
  createTeam: jest.fn(),
  addSeats: jest.fn(),
  getMyTeam: jest.fn(),
  createInvite: jest.fn(),
  listMembers: jest.fn(),
  acceptInvite: jest.fn(),
  removeMember: jest.fn(),
  addDomain: jest.fn(),
  verifyDomain: jest.fn(),
  updateInstructions: jest.fn(),
  setMemberCreditLimit: jest.fn(),
  getPreferences: jest.fn(),
  updateMyPreferences: jest.fn(),
  updateWorkspacePreferences: jest.fn(),
}))

jest.mock('../workspace-service', () => ({
  getTeamAnalytics: jest.fn(),
  searchWorkspace: jest.fn(),
  listSharedWatchlists: jest.fn(),
  createSharedWatchlist: jest.fn(),
  deleteSharedWatchlist: jest.fn(),
  listSharedScreeners: jest.fn(),
  createSharedScreener: jest.fn(),
  deleteSharedScreener: jest.fn(),
  listResearchNotes: jest.fn(),
  createResearchNote: jest.fn(),
  deleteResearchNote: jest.fn(),
}))

import { UnauthorizedError, ValidationError } from '../../../shared/errors'
import * as controller from '../controller'
import * as TeamService from '../service'
import * as Workspace from '../workspace-service'

const UUID = '123e4567-e89b-12d3-a456-426614174000'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
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

describe('handle wrapper', () => {
  it('wraps data in the success envelope with the default 200', async () => {
    ;(TeamService.getMyTeam as jest.Mock).mockResolvedValue({ id: 't1' })
    const res = mockRes()
    await controller.getMyTeam(mockReq(), res, next)
    expect(TeamService.getMyTeam).toHaveBeenCalledWith('user-1')
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Team fetched',
      data: { id: 't1' },
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('omits data when the handler returns nothing', async () => {
    ;(TeamService.removeMember as jest.Mock).mockResolvedValue(undefined)
    const res = mockRes()
    await controller.removeMember(
      mockReq({ params: { userId: UUID } }),
      res,
      next,
    )
    expect(TeamService.removeMember).toHaveBeenCalledWith('user-1', UUID)
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Member removed',
    })
  })

  it('forwards service errors to next() without responding', async () => {
    const error = new Error('boom')
    ;(TeamService.getMyTeam as jest.Mock).mockRejectedValue(error)
    const res = mockRes()
    await controller.getMyTeam(mockReq(), res, next)
    expect(next).toHaveBeenCalledWith(error)
    expect(res.json).not.toHaveBeenCalled()
  })

  it('forwards an Unauthorized error when the request has no user', async () => {
    const res = mockRes()
    await controller.getMyTeam(mockReq({ user: undefined }), res, next)
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError))
    expect(TeamService.getMyTeam).not.toHaveBeenCalled()
  })

  it('forwards validation errors and never calls the service', async () => {
    const res = mockRes()
    await controller.createTeam(
      mockReq({ body: { name: 'x', seatCount: 1 } }),
      res,
      next,
    )
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError))
    expect(TeamService.createTeam).not.toHaveBeenCalled()
  })
})

describe('createTeam / addSeats paid vs bypass outputs', () => {
  const body = { name: 'Fund', seatCount: 4 }

  it('createTeam returns the checkout at top level (201) in payment mode', async () => {
    ;(TeamService.createTeam as jest.Mock).mockResolvedValue({
      checkout: { checkoutUrl: 'https://pay' },
    })
    const res = mockRes()
    await controller.createTeam(mockReq({ body }), res, next)
    expect(TeamService.createTeam).toHaveBeenCalledWith('user-1', body)
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Team request processed',
      checkoutUrl: 'https://pay',
    })
  })

  it('createTeam returns data in bypass mode', async () => {
    ;(TeamService.createTeam as jest.Mock).mockResolvedValue({
      checkout: null,
      result: { teamId: 't1' },
    })
    const res = mockRes()
    await controller.createTeam(mockReq({ body }), res, next)
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Team request processed',
      data: { teamId: 't1' },
    })
  })

  it('addSeats returns the checkout in payment mode', async () => {
    ;(TeamService.addSeats as jest.Mock).mockResolvedValue({
      checkout: { checkoutUrl: 'https://pay' },
    })
    const res = mockRes()
    await controller.addSeats(mockReq({ body: { seatCount: 3 } }), res, next)
    expect(TeamService.addSeats).toHaveBeenCalledWith('user-1', 3)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Seat request processed',
      checkoutUrl: 'https://pay',
    })
  })

  it('addSeats returns data in bypass mode', async () => {
    ;(TeamService.addSeats as jest.Mock).mockResolvedValue({
      checkout: null,
      result: { seatCapacity: 9 },
    })
    const res = mockRes()
    await controller.addSeats(mockReq({ body: { seatCount: 3 } }), res, next)
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Seat request processed',
      data: { seatCapacity: 9 },
    })
  })
})

interface Case {
  name: string
  handler: (req: any, res: any, next: any) => Promise<unknown>
  service: jest.Mock
  req: Record<string, any>
  args: unknown[]
  status: number
  message: string
}

const cases: Case[] = [
  {
    name: 'listMembers',
    handler: controller.listMembers,
    service: TeamService.listMembers as jest.Mock,
    req: {},
    args: ['user-1'],
    status: 200,
    message: 'Members fetched',
  },
  {
    name: 'createInvite',
    handler: controller.createInvite,
    service: TeamService.createInvite as jest.Mock,
    req: { body: { email: 'A@B.com' } },
    args: ['user-1', { email: 'a@b.com', role: 'MEMBER' }],
    status: 201,
    message: 'Invite created',
  },
  {
    name: 'acceptInvite',
    handler: controller.acceptInvite,
    service: TeamService.acceptInvite as jest.Mock,
    req: { body: { token: 'tok' } },
    args: ['user-1', 'tok'],
    status: 200,
    message: 'Invite accepted',
  },
  {
    name: 'addDomain',
    handler: controller.addDomain,
    service: TeamService.addDomain as jest.Mock,
    req: { body: { domain: 'Fund.com' } },
    args: ['user-1', { domain: 'fund.com', restrictOrgCreation: true }],
    status: 201,
    message: 'Domain added',
  },
  {
    name: 'verifyDomain',
    handler: controller.verifyDomain,
    service: TeamService.verifyDomain as jest.Mock,
    req: { body: { domain: 'fund.com' } },
    args: ['user-1', 'fund.com'],
    status: 200,
    message: 'Domain checked',
  },
  {
    name: 'updateInstructions',
    handler: controller.updateInstructions,
    service: TeamService.updateInstructions as jest.Mock,
    req: { body: { orgInstructions: ' hi ' } },
    args: ['user-1', 'hi'],
    status: 200,
    message: 'Instructions updated',
  },
  {
    name: 'setMemberCreditLimit',
    handler: controller.setMemberCreditLimit,
    service: TeamService.setMemberCreditLimit as jest.Mock,
    req: { params: { userId: UUID }, body: { monthlyCreditLimitPaisa: 500 } },
    args: ['user-1', UUID, 500],
    status: 200,
    message: 'Credit limit updated',
  },
  {
    name: 'getPreferences',
    handler: controller.getPreferences,
    service: TeamService.getPreferences as jest.Mock,
    req: {},
    args: ['user-1'],
    status: 200,
    message: 'Preferences fetched',
  },
  {
    name: 'updateMyPreferences',
    handler: controller.updateMyPreferences,
    service: TeamService.updateMyPreferences as jest.Mock,
    req: { body: { theme: 'DARK' } },
    args: ['user-1', { theme: 'DARK' }],
    status: 200,
    message: 'Preferences updated',
  },
  {
    name: 'updateWorkspacePreferences',
    handler: controller.updateWorkspacePreferences,
    service: TeamService.updateWorkspacePreferences as jest.Mock,
    req: { body: { chartLayout: 'GRID' } },
    args: ['user-1', { chartLayout: 'GRID' }],
    status: 200,
    message: 'Workspace preferences updated',
  },
  {
    name: 'getAnalytics',
    handler: controller.getAnalytics,
    service: Workspace.getTeamAnalytics as jest.Mock,
    req: {},
    args: ['user-1'],
    status: 200,
    message: 'Analytics fetched',
  },
  {
    name: 'search',
    handler: controller.search,
    service: Workspace.searchWorkspace as jest.Mock,
    req: { query: { q: ' aapl ' } },
    args: ['user-1', 'aapl'],
    status: 200,
    message: 'Workspace search completed',
  },
  {
    name: 'listWatchlists',
    handler: controller.listWatchlists,
    service: Workspace.listSharedWatchlists as jest.Mock,
    req: {},
    args: ['user-1'],
    status: 200,
    message: 'Shared watchlists fetched',
  },
  {
    name: 'createWatchlist',
    handler: controller.createWatchlist,
    service: Workspace.createSharedWatchlist as jest.Mock,
    req: { body: { name: 'W', symbols: ['aapl'] } },
    args: ['user-1', { name: 'W', symbols: ['AAPL'] }],
    status: 201,
    message: 'Shared watchlist created',
  },
  {
    name: 'listScreeners',
    handler: controller.listScreeners,
    service: Workspace.listSharedScreeners as jest.Mock,
    req: {},
    args: ['user-1'],
    status: 200,
    message: 'Shared screeners fetched',
  },
  {
    name: 'createScreener',
    handler: controller.createScreener,
    service: Workspace.createSharedScreener as jest.Mock,
    req: { body: { name: 'S', criteria: { pe: 1 } } },
    args: ['user-1', { name: 'S', criteria: { pe: 1 } }],
    status: 201,
    message: 'Shared screener created',
  },
  {
    name: 'listNotes (symbol)',
    handler: controller.listNotes,
    service: Workspace.listResearchNotes as jest.Mock,
    req: { query: { symbol: 'aapl' } },
    args: ['user-1', 'AAPL'],
    status: 200,
    message: 'Research notes fetched',
  },
  {
    name: 'listNotes (no symbol)',
    handler: controller.listNotes,
    service: Workspace.listResearchNotes as jest.Mock,
    req: { query: {} },
    args: ['user-1', undefined],
    status: 200,
    message: 'Research notes fetched',
  },
  {
    name: 'createNote',
    handler: controller.createNote,
    service: Workspace.createResearchNote as jest.Mock,
    req: { body: { symbol: 'aapl', content: 'Buy' } },
    args: ['user-1', { symbol: 'AAPL', content: 'Buy' }],
    status: 201,
    message: 'Research note created',
  },
]

describe.each(cases)('$name', (c) => {
  it('validates input, calls the service and responds', async () => {
    c.service.mockResolvedValue({ ok: true })
    const res = mockRes()
    await c.handler(mockReq(c.req), res, next)
    expect(c.service).toHaveBeenCalledWith(...c.args)
    expect(res.status).toHaveBeenCalledWith(c.status)
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: c.message,
      data: { ok: true },
    })
  })

  it('forwards service errors to next()', async () => {
    const error = new Error('fail')
    c.service.mockRejectedValue(error)
    const res = mockRes()
    await c.handler(mockReq(c.req), res, next)
    expect(next).toHaveBeenCalledWith(error)
  })
})

describe('delete handlers', () => {
  it.each([
    ['deleteWatchlist', controller.deleteWatchlist, 'deleteSharedWatchlist'],
    ['deleteScreener', controller.deleteScreener, 'deleteSharedScreener'],
    ['deleteNote', controller.deleteNote, 'deleteResearchNote'],
  ] as const)(
    '%s validates the id param and responds without data',
    async (_name, handler, serviceName) => {
      const service = Workspace[serviceName] as jest.Mock
      service.mockResolvedValue(undefined)
      const res = mockRes()
      await handler(mockReq({ params: { id: UUID } }), res, next)
      expect(service).toHaveBeenCalledWith('user-1', UUID)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.not.objectContaining({ data: expect.anything() }),
      )
    },
  )

  it('rejects a malformed id param', async () => {
    const res = mockRes()
    await controller.deleteNote(mockReq({ params: { id: 'nope' } }), res, next)
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError))
    expect(Workspace.deleteResearchNote).not.toHaveBeenCalled()
  })

  it('rejects a malformed userId param on removeMember', async () => {
    const res = mockRes()
    await controller.removeMember(
      mockReq({ params: { userId: 'nope' } }),
      res,
      next,
    )
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError))
    expect(TeamService.removeMember).not.toHaveBeenCalled()
  })
})

describe('search validation', () => {
  it('rejects a too-short query', async () => {
    const res = mockRes()
    await controller.search(mockReq({ query: { q: 'a' } }), res, next)
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError))
    expect(Workspace.searchWorkspace).not.toHaveBeenCalled()
  })
})

describe('listNotes — query validation', () => {
  it.each([
    [{ symbol: ['a', 'b'] }],
    [{ symbol: '' }],
    [{ symbol: 'WAYTOOLONGSYMBOL' }],
  ])(
    'rejects an invalid symbol %j instead of silently ignoring it',
    async (query) => {
      const next = jest.fn()
      const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() }

      await controller.listNotes(
        { user: { userId: 'user-1' }, query } as any,
        res,
        next,
      )

      expect(next).toHaveBeenCalledWith(expect.any(Error))
      expect(Workspace.listResearchNotes).not.toHaveBeenCalled()
    },
  )

  it('normalises the symbol to upper case before it reaches the service', async () => {
    const next = jest.fn()
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() }
    ;(Workspace.listResearchNotes as jest.Mock).mockResolvedValue([])

    await controller.listNotes(
      { user: { userId: 'user-1' }, query: { symbol: 'aapl' } } as any,
      res,
      next,
    )

    expect(Workspace.listResearchNotes).toHaveBeenCalledWith('user-1', 'AAPL')
  })
})
