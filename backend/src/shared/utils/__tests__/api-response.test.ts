import { sendError, sendSuccess } from '../api-response'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

describe('sendSuccess', () => {
  it('sends a minimal success envelope with defaults when no options are given', () => {
    const res = mockRes()
    sendSuccess(res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ success: true })
  })

  it('includes message, data, and a custom status code when provided', () => {
    const res = mockRes()
    sendSuccess(res, { message: 'ok', data: { id: 1 }, statusCode: 201 })
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'ok',
      data: { id: 1 },
    })
  })

  it('spreads extra top-level fields into the envelope', () => {
    const res = mockRes()
    sendSuccess(res, { extra: { nextCursor: 'abc' } })
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      nextCursor: 'abc',
    })
  })

  it('omits data when it is explicitly undefined', () => {
    const res = mockRes()
    sendSuccess(res, { data: undefined })
    expect(res.json).toHaveBeenCalledWith({ success: true })
  })
})

describe('sendError', () => {
  it('sends a minimal error envelope with the default 500 status', () => {
    const res = mockRes()
    sendError(res, { message: 'boom' })
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'boom',
      statusCode: 500,
    })
  })

  it('includes details, errorCode, and a custom status code when provided', () => {
    const res = mockRes()
    sendError(res, {
      message: 'not found',
      statusCode: 404,
      details: { field: 'id' },
      errorCode: 'NOT_FOUND',
    })
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'not found',
      statusCode: 404,
      details: { field: 'id' },
      errorCode: 'NOT_FOUND',
    })
  })

  it('omits details when explicitly undefined and errorCode when falsy', () => {
    const res = mockRes()
    sendError(res, { message: 'boom', details: undefined, errorCode: '' })
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'boom',
      statusCode: 500,
    })
  })
})
