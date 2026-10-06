const mockRedis = { current: null as unknown }

jest.mock('../../../shared/infrastructure/cache', () => ({
  getRawRedisClient: () => mockRedis.current,
}))

import config from '@/config'
import { ServiceUnavailableError } from '../../../shared/errors'
import { getKeyValueStore } from '../kv-store'
import {
  bindingMatches,
  claimResponse,
  consumeExchangeCode,
  consumeFlowState,
  createBinding,
  createExchangeCode,
  createFlowState,
} from '../state'
import { SsoFlowPurpose } from '../types'

const setNodeEnv = (value: string) => {
  ;(config.server as { nodeEnv: string }).nodeEnv = value
}

beforeEach(() => {
  mockRedis.current = null
  setNodeEnv('test')
})

describe('in-process key-value store (no Redis)', () => {
  it('stores, reads and removes values', async () => {
    const kv = getKeyValueStore()
    await kv.set('a', '1', 60_000)

    expect(await kv.get('a')).toBe('1')
    expect(await kv.take('a')).toBe('1')
    expect(await kv.get('a')).toBeNull()
    expect(await kv.take('a')).toBeNull()
  })

  it('expires entries', async () => {
    const kv = getKeyValueStore()
    await kv.set('short', '1', -1)

    expect(await kv.get('short')).toBeNull()
  })

  it('setIfAbsent claims a key once, until it expires', async () => {
    const kv = getKeyValueStore()

    expect(await kv.setIfAbsent('claim', '1', 60_000)).toBe(true)
    expect(await kv.setIfAbsent('claim', '1', 60_000)).toBe(false)
    await kv.set('lapsed', '1', -1)
    expect(await kv.setIfAbsent('lapsed', '2', 60_000)).toBe(true)
  })

  it('is refused in production, where instances must share state', () => {
    setNodeEnv('production')

    expect(() => getKeyValueStore()).toThrow(ServiceUnavailableError)
  })
})

describe('Redis-backed key-value store', () => {
  const fakeRedis = () => {
    const calls: unknown[][] = []
    const multi = {
      get: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, 'stored'],
        [null, 1],
      ]),
    }
    const redis = {
      set: jest.fn(async (...args: unknown[]) => {
        calls.push(args)
        return args.includes('NX') ? 'OK' : 'OK'
      }),
      get: jest.fn().mockResolvedValue('stored'),
      del: jest.fn().mockResolvedValue(1),
      multi: jest.fn(() => multi),
    }
    return { redis, multi, calls }
  }

  it('prefixes keys and sets a millisecond TTL', async () => {
    const { redis } = fakeRedis()
    mockRedis.current = redis

    await getKeyValueStore().set('k', 'v', 5000)

    expect(redis.set).toHaveBeenCalledWith('sso:k', 'v', 'PX', 5000)
  })

  it('setIfAbsent uses NX and reports whether it won', async () => {
    const { redis } = fakeRedis()
    mockRedis.current = redis

    expect(await getKeyValueStore().setIfAbsent('k', 'v', 5000)).toBe(true)
    expect(redis.set).toHaveBeenCalledWith('sso:k', 'v', 'PX', 5000, 'NX')

    redis.set.mockResolvedValueOnce(null as never)
    expect(await getKeyValueStore().setIfAbsent('k', 'v', 5000)).toBe(false)
  })

  it('take reads and deletes in one transaction', async () => {
    const { redis, multi } = fakeRedis()
    mockRedis.current = redis

    expect(await getKeyValueStore().take('k')).toBe('stored')
    expect(multi.get).toHaveBeenCalledWith('sso:k')
    expect(multi.del).toHaveBeenCalledWith('sso:k')
  })

  it('take answers null when nothing was stored or the transaction failed', async () => {
    const { redis, multi } = fakeRedis()
    mockRedis.current = redis
    multi.exec.mockResolvedValueOnce([
      [null, null],
      [null, 0],
    ])
    expect(await getKeyValueStore().take('k')).toBeNull()

    multi.exec.mockResolvedValueOnce(null)
    expect(await getKeyValueStore().take('k')).toBeNull()
  })

  it('get and remove pass through', async () => {
    const { redis } = fakeRedis()
    mockRedis.current = redis

    expect(await getKeyValueStore().get('k')).toBe('stored')
    await getKeyValueStore().remove('k')
    expect(redis.del).toHaveBeenCalledWith('sso:k')
  })
})

describe('flow state', () => {
  it('is single use and keeps what was stored', async () => {
    const nonce = await createFlowState({
      tenantId: 't1',
      purpose: SsoFlowPurpose.LOGIN,
      bindingHash: 'h',
    })

    expect(await consumeFlowState(nonce)).toEqual({
      tenantId: 't1',
      purpose: SsoFlowPurpose.LOGIN,
      bindingHash: 'h',
    })
    expect(await consumeFlowState(nonce)).toBeNull()
  })

  it('returns null for an unknown nonce', async () => {
    expect(await consumeFlowState('missing')).toBeNull()
  })

  it('returns null for stored data that is not valid state', async () => {
    await getKeyValueStore().set('state:bad', 'not json', 60_000)
    await getKeyValueStore().set('state:wrong', '{"x":1}', 60_000)

    expect(await consumeFlowState('bad')).toBeNull()
    expect(await consumeFlowState('wrong')).toBeNull()
  })
})

describe('binding and exchange codes', () => {
  it('matches only the browser that holds the token', () => {
    const binding = createBinding()

    expect(bindingMatches(binding.token, binding.hash)).toBe(true)
    expect(bindingMatches('another-token', binding.hash)).toBe(false)
    expect(bindingMatches(binding.token, 'short')).toBe(false)
  })

  it('exchange codes are single use', async () => {
    const code = await createExchangeCode({
      tenantId: 't1',
      email: 'sam@fund.com',
      bindingHash: 'h',
    })

    expect(await consumeExchangeCode(code)).toEqual({
      tenantId: 't1',
      email: 'sam@fund.com',
      bindingHash: 'h',
    })
    expect(await consumeExchangeCode(code)).toBeNull()
  })
})

describe('claimResponse', () => {
  it('is true once per tenant and request id', async () => {
    expect(await claimResponse('t1', 'req-1')).toBe(true)
    expect(await claimResponse('t1', 'req-1')).toBe(false)
    expect(await claimResponse('t2', 'req-1')).toBe(true)
  })
})
