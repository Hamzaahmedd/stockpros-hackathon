jest.mock('../session-management', () => ({
  listActiveSessions: jest.fn(),
  revokeSession: jest.fn(),
  revokeOtherSessions: jest.fn(),
}))

import { ValidationError } from '../../../shared/errors'
import * as controller from '../controller'
import {
  listActiveSessions,
  revokeOtherSessions,
  revokeSession,
} from '../session-management'

const SESSION_ID = '018f2e1a-9c3d-7b2a-9f1e-2a3b4c5d6e7f'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

const mockReq = (overrides: Record<string, any> = {}) => ({
  user: { userId: 'user-1', sessionId: 'sess-current' },
  params: {},
  ...overrides,
})

const next = jest.fn()

beforeEach(() => jest.clearAllMocks())

describe('listMySessions', () => {
  it("lists the caller's sessions, flagging the current one", async () => {
    ;(listActiveSessions as jest.Mock).mockResolvedValue([{ id: 'a' }])
    const res = mockRes()

    await controller.listMySessions(mockReq() as any, res, next)

    expect(listActiveSessions).toHaveBeenCalledWith('user-1', 'sess-current')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ id: 'a' }] }),
    )
  })

  it('forwards failures to next', async () => {
    const err = new Error('db down')
    ;(listActiveSessions as jest.Mock).mockRejectedValue(err)

    await controller.listMySessions(mockReq() as any, mockRes(), next)

    expect(next).toHaveBeenCalledWith(err)
  })
})

describe('revokeMySession', () => {
  it("revokes the caller's own session", async () => {
    const res = mockRes()

    await controller.revokeMySession(
      mockReq({ params: { id: SESSION_ID } }) as any,
      res,
      next,
    )

    expect(revokeSession).toHaveBeenCalledWith('user-1', SESSION_ID)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Session revoked' }),
    )
  })

  it('rejects a malformed id before touching the database', async () => {
    await controller.revokeMySession(
      mockReq({ params: { id: 'not-a-uuid' } }) as any,
      mockRes(),
      next,
    )

    expect(revokeSession).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError))
  })
})

describe('revokeMyOtherSessions', () => {
  it('signs out everything but the current session and reports the count', async () => {
    ;(revokeOtherSessions as jest.Mock).mockResolvedValue(2)
    const res = mockRes()

    await controller.revokeMyOtherSessions(mockReq() as any, res, next)

    expect(revokeOtherSessions).toHaveBeenCalledWith('user-1', 'sess-current')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ revoked: 2 }),
    )
  })
})
