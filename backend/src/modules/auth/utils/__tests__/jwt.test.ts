import jwt from 'jsonwebtoken'
import { signToken, verifyAccessToken, verifyRefreshToken } from '../jwt'

const SECRET = 'test-secret'

describe('signToken / verifyAccessToken', () => {
  it('round-trips a payload through sign and verify', () => {
    const token = signToken({ sub: 'user-1' }, SECRET, '1h')
    const payload = verifyAccessToken(token, SECRET) as any
    expect(payload.sub).toBe('user-1')
  })

  it('throws when the access token is verified with the wrong secret', () => {
    const token = signToken({ sub: 'user-1' }, SECRET, '1h')
    expect(() => verifyAccessToken(token, 'wrong-secret')).toThrow()
  })
})

describe('verifyRefreshToken', () => {
  it('returns the payload for a valid refresh token', () => {
    const token = jwt.sign({ sub: 'user-1', jti: 'jti-1' }, SECRET, {
      expiresIn: '1h',
    })
    const result = verifyRefreshToken(token, SECRET)
    expect(result).toMatchObject({ sub: 'user-1', jti: 'jti-1' })
  })

  it('throws FORCE_LOGOUT for an expired refresh token', () => {
    const token = jwt.sign({ sub: 'user-1', jti: 'jti-1' }, SECRET, {
      expiresIn: -10,
    })
    expect(() => verifyRefreshToken(token, SECRET)).toThrow('FORCE_LOGOUT')
  })

  it('throws a generic error for any other invalid refresh token', () => {
    expect(() => verifyRefreshToken('not-a-real-token', SECRET)).toThrow(
      'Invalid refresh token',
    )
  })

  it('throws a generic error when verified with the wrong secret', () => {
    const token = jwt.sign({ sub: 'user-1', jti: 'jti-1' }, SECRET, {
      expiresIn: '1h',
    })
    expect(() => verifyRefreshToken(token, 'wrong-secret')).toThrow(
      'Invalid refresh token',
    )
  })
})
