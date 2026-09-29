jest.mock('../service', () => ({
  checkPermission: jest.fn(),
}))

import { checkPermission } from '../service'
import { allRbacMiddleware, rbacMiddleware } from '../middleware'

const mockCheckPermission = checkPermission as jest.Mock

const mockReq = (userId?: string) =>
  ({ user: userId ? { userId } : undefined }) as any
const mockRes = () => ({}) as any

beforeEach(() => jest.clearAllMocks())

describe('rbacMiddleware', () => {
  it('calls next() with no error when permitted', async () => {
    mockCheckPermission.mockResolvedValue(true)
    const next = jest.fn()

    await rbacMiddleware('watchlist', 'read')(
      mockReq('user-1'),
      mockRes(),
      next,
    )

    expect(mockCheckPermission).toHaveBeenCalledWith(
      'user-1',
      'watchlist',
      'read',
    )
    expect(next).toHaveBeenCalledWith()
  })

  it('calls next() with a ForbiddenError when not permitted', async () => {
    mockCheckPermission.mockResolvedValue(false)
    const next = jest.fn()

    await rbacMiddleware('watchlist', 'read')(
      mockReq('user-1'),
      mockRes(),
      next,
    )

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    )
  })

  it('passes an undefined userId through when the request is unauthenticated', async () => {
    mockCheckPermission.mockResolvedValue(false)
    const next = jest.fn()

    await rbacMiddleware('watchlist', 'read')(mockReq(), mockRes(), next)

    expect(mockCheckPermission).toHaveBeenCalledWith(
      undefined,
      'watchlist',
      'read',
    )
  })
})

describe('allRbacMiddleware', () => {
  it('calls next() with no error when every requirement is permitted', async () => {
    mockCheckPermission.mockResolvedValue(true)
    const next = jest.fn()

    await allRbacMiddleware(
      { resource: 'watchlist', action: 'read' },
      { resource: 'watchlist', action: 'write' },
    )(mockReq('user-1'), mockRes(), next)

    expect(mockCheckPermission).toHaveBeenCalledTimes(2)
    expect(next).toHaveBeenCalledWith()
  })

  it('calls next() with a ForbiddenError when any requirement fails', async () => {
    mockCheckPermission.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const next = jest.fn()

    await allRbacMiddleware(
      { resource: 'watchlist', action: 'read' },
      { resource: 'watchlist', action: 'write' },
    )(mockReq('user-1'), mockRes(), next)

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    )
  })

  it('permits an empty requirement list (vacuous truth)', async () => {
    const next = jest.fn()

    await allRbacMiddleware()(mockReq('user-1'), mockRes(), next)

    expect(mockCheckPermission).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })
})
