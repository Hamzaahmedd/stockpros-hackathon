const mockWarn = jest.fn()
jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: { warn: (...args: unknown[]) => mockWarn(...args) },
}))

import config from '@/config'
import { IpNotAllowedError } from '../../../shared/errors'
import { isIpAllowed, parseAllowlist, requireAllowedIp } from '../ip-allowlist'

const admin = config.admin as { ipAllowlist: string[] }
const original = admin.ipAllowlist
afterEach(() => {
  admin.ipAllowlist = original
  jest.clearAllMocks()
})

const allowed = (ip: string | undefined, list: string[]) =>
  isIpAllowed(ip, parseAllowlist(list))

describe('parseAllowlist', () => {
  it.each([
    '203.0.113.7',
    '203.0.113.0/24',
    '2001:db8::1',
    '2001:db8::/32',
    ' 10.0.0.0/8 ',
  ])('accepts %s', (entry) => {
    expect(() => parseAllowlist([entry])).not.toThrow()
  })

  it.each(['office', '203.0.113.256', '10.0.0.0/99', '2001:db8::/200', ''])(
    'rejects %j with a clear message',
    (entry) => {
      expect(() => parseAllowlist([entry])).toThrow(/Invalid admin.ipAllowlist/)
    },
  )

  it('accepts an empty list', () => {
    expect(parseAllowlist([])).toEqual([])
  })
})

describe('isIpAllowed', () => {
  it('matches an exact IPv4 address and nothing else', () => {
    expect(allowed('203.0.113.7', ['203.0.113.7'])).toBe(true)
    expect(allowed('203.0.113.8', ['203.0.113.7'])).toBe(false)
  })

  it('matches CIDR ranges at their edges', () => {
    const list = ['203.0.113.0/24']
    expect(allowed('203.0.113.0', list)).toBe(true)
    expect(allowed('203.0.113.255', list)).toBe(true)
    expect(allowed('203.0.114.0', list)).toBe(false)
  })

  it('treats IPv4-mapped IPv6 as the IPv4 address it wraps', () => {
    expect(allowed('::ffff:203.0.113.7', ['203.0.113.7'])).toBe(true)
    expect(allowed('::ffff:203.0.113.9', ['203.0.113.0/24'])).toBe(true)
    expect(allowed('::ffff:198.51.100.1', ['203.0.113.0/24'])).toBe(false)
  })

  it('matches IPv6 exact addresses and ranges', () => {
    expect(allowed('2001:db8::1', ['2001:db8::1'])).toBe(true)
    expect(allowed('2001:db8:0:0:0:0:0:1', ['2001:db8::1'])).toBe(true)
    expect(allowed('2001:db8:abcd::9', ['2001:db8::/32'])).toBe(true)
    expect(allowed('2001:db9::1', ['2001:db8::/32'])).toBe(false)
  })

  it('never matches across address families', () => {
    expect(allowed('203.0.113.7', ['2001:db8::/32'])).toBe(false)
    expect(allowed('2001:db8::1', ['203.0.113.0/24'])).toBe(false)
    expect(allowed('2001:db8::1', ['203.0.113.7'])).toBe(false)
  })

  it('allows if any entry matches', () => {
    expect(allowed('10.1.2.3', ['203.0.113.7', '10.0.0.0/8'])).toBe(true)
  })

  it('denies a missing or unparseable address', () => {
    expect(allowed(undefined, ['0.0.0.0/0'])).toBe(false)
    expect(allowed('not-an-ip', ['0.0.0.0/0'])).toBe(false)
    expect(allowed('', ['0.0.0.0/0'])).toBe(false)
  })
})

describe('requireAllowedIp', () => {
  const run = (ip: string | undefined) => {
    const next = jest.fn()
    requireAllowedIp({ ip, path: '/users/search' } as any, {} as any, next)
    return next.mock.calls[0][0]
  }

  it('is disabled while the list is empty', () => {
    admin.ipAllowlist = []
    expect(run('198.51.100.1')).toBeUndefined()
    expect(run(undefined)).toBeUndefined()
  })

  it('lets listed networks through', () => {
    admin.ipAllowlist = ['203.0.113.0/24']
    expect(run('::ffff:203.0.113.20')).toBeUndefined()
  })

  it('blocks everything else with 403 ADMIN_IP_NOT_ALLOWED, without logging the address', () => {
    admin.ipAllowlist = ['203.0.113.0/24']
    const error = run('198.51.100.1')

    expect(error).toBeInstanceOf(IpNotAllowedError)
    expect(error.statusCode).toBe(403)
    expect(error.code).toBe('ADMIN_IP_NOT_ALLOWED')
    expect(mockWarn).toHaveBeenCalledWith(
      '[Admin] request blocked by the IP allowlist',
      { path: '/users/search' },
    )
    expect(JSON.stringify(mockWarn.mock.calls)).not.toContain('198.51.100.1')
  })

  it('blocks a request whose address Express could not determine', () => {
    admin.ipAllowlist = ['203.0.113.0/24']
    expect(run(undefined)).toBeInstanceOf(IpNotAllowedError)
  })
})

describe('boot-time validation', () => {
  it('refuses to load when the configured allowlist has a malformed entry', () => {
    jest.isolateModules(() => {
      jest.doMock('@/config', () => ({
        __esModule: true,
        default: { admin: { ipAllowlist: ['office-vpn'] } },
      }))
      expect(() => require('../ip-allowlist')).toThrow(
        /Invalid admin.ipAllowlist entry "office-vpn"/,
      )
    })
    jest.dontMock('@/config')
  })
})
