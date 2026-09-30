const loadCookieConfig = (nodeEnv: string) => {
  jest.resetModules()
  jest.doMock('@/config', () => {
    const actual = jest.requireActual('@/config')
    const patched = {
      ...actual.default,
      server: { ...actual.default.server, nodeEnv },
    }
    return { __esModule: true, default: patched, config: patched }
  })
  return jest.requireActual('../cookie') as typeof import('../cookie')
}

describe('cookie config — non-production', () => {
  it('uses insecure, lax cookies outside production', () => {
    const { defaultCookieOptions, refreshCookieOptions } =
      loadCookieConfig('test')
    expect(defaultCookieOptions).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    })
    expect(refreshCookieOptions.path).toBe('/api/v1/auth')
  })
})

describe('cookie config — production', () => {
  it('uses secure, SameSite=None cookies in production', () => {
    const { defaultCookieOptions } = loadCookieConfig('production')
    expect(defaultCookieOptions).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
    })
  })
})

// Makes this file a module so its top-level helpers do not collide with other
// import-less test files in the shared ts-jest program (TS2451).
export {}
