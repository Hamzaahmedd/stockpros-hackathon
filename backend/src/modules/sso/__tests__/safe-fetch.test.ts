import { EventEmitter } from 'node:events'

const mockGet = jest.fn()
const mockLookup = jest.fn()

jest.mock('node:https', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockGet(...args) },
}))
jest.mock('node:dns', () => ({
  __esModule: true,
  default: { lookup: (...args: unknown[]) => mockLookup(...args) },
}))

import {
  fetchMetadataDocument,
  isPublicAddress,
  MAX_METADATA_BYTES,
  publicOnlyLookup,
} from '../safe-fetch'
import { SsoConfigurationError } from '../provider'

afterEach(() => jest.resetAllMocks())

describe('isPublicAddress', () => {
  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
  ])('accepts %s', (address) => {
    expect(isPublicAddress(address)).toBe(true)
  })

  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    '::ffff:10.0.0.1',
    '::ffff:127.0.0.1',
    'not-an-ip',
    '',
  ])('refuses %s', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })
})

describe('publicOnlyLookup', () => {
  const lookup = (hostname: string, options: object) =>
    new Promise<{ error: unknown; result: unknown }>((resolve) => {
      publicOnlyLookup(hostname, options, ((
        error: unknown,
        ...rest: unknown[]
      ) => resolve({ error, result: rest })) as never)
    })

  it('passes a public address through', async () => {
    mockLookup.mockImplementation((_host, _opts, cb) =>
      cb(null, [{ address: '8.8.8.8', family: 4 }]),
    )

    await expect(lookup('idp.example.com', {})).resolves.toEqual({
      error: null,
      result: ['8.8.8.8', 4],
    })
  })

  it('returns the list when the caller asked for every address', async () => {
    const list = [{ address: '8.8.8.8', family: 4 }]
    mockLookup.mockImplementation((_host, _opts, cb) => cb(null, list))

    await expect(lookup('idp.example.com', { all: true })).resolves.toEqual({
      error: null,
      result: [list],
    })
  })

  it('refuses a host that resolves to any private address', async () => {
    mockLookup.mockImplementation((_host, _opts, cb) =>
      cb(null, [
        { address: '8.8.8.8', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ]),
    )

    const { error } = await lookup('evil.example.com', {})

    expect(error).toBeInstanceOf(SsoConfigurationError)
  })

  it('refuses a host with no addresses', async () => {
    mockLookup.mockImplementation((_host, _opts, cb) => cb(null, []))

    const { error } = await lookup('empty.example.com', {})

    expect(error).toBeInstanceOf(SsoConfigurationError)
  })

  it('passes a DNS failure through', async () => {
    const failure = new Error('ENOTFOUND')
    mockLookup.mockImplementation((_host, _opts, cb) => cb(failure))

    const { error } = await lookup('nope.example.com', {})

    expect(error).toBe(failure)
  })
})

describe('fetchMetadataDocument', () => {
  /** Makes `https.get` answer with the given status and body chunks. */
  const respondWith = (status: number, chunks: Buffer[] = []) => {
    const request = Object.assign(new EventEmitter(), { destroy: jest.fn() })
    mockGet.mockImplementation((_url, _options, handler) => {
      const response = Object.assign(new EventEmitter(), {
        statusCode: status,
        resume: jest.fn(),
      })
      // Like the real client, the response arrives after `get` has returned.
      setImmediate(() => {
        handler(response)
        chunks.forEach((chunk) => response.emit('data', chunk))
        response.emit('end')
      })
      return request
    })
    return request
  }

  it('returns the body of a 200 response', async () => {
    respondWith(200, [Buffer.from('<md'), Buffer.from('/>')])

    await expect(
      fetchMetadataDocument('https://idp.example.com/metadata'),
    ).resolves.toBe('<md/>')
    expect(mockGet.mock.calls[0][1]).toMatchObject({
      lookup: publicOnlyLookup,
    })
  })

  it.each([
    ['not a URL', 'not a url'],
    ['plain http', 'http://idp.example.com/metadata'],
    ['credentials in the URL', 'https://user:pass@idp.example.com/metadata'],
  ])('refuses %s without making a request', async (_label, url) => {
    await expect(fetchMetadataDocument(url)).rejects.toBeInstanceOf(
      SsoConfigurationError,
    )
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('refuses a non-200 answer, including a redirect', async () => {
    respondWith(302)

    await expect(
      fetchMetadataDocument('https://idp.example.com/metadata'),
    ).rejects.toThrow('did not return 200')
  })

  it('refuses a body over the size limit and stops reading', async () => {
    const request = respondWith(200, [Buffer.alloc(MAX_METADATA_BYTES + 1)])

    await expect(
      fetchMetadataDocument('https://idp.example.com/metadata'),
    ).rejects.toThrow('too large')
    expect(request.destroy).toHaveBeenCalled()
  })

  it('reports a connection failure without leaking its detail', async () => {
    const request = new EventEmitter()
    mockGet.mockImplementation(() => {
      setImmediate(() =>
        request.emit('error', new Error('ECONNREFUSED 10.0.0.1')),
      )
      return request
    })

    await expect(
      fetchMetadataDocument('https://idp.example.com/metadata'),
    ).rejects.toThrow('Could not reach the metadata URL')
  })

  it('passes through the lookup refusal as a configuration error', async () => {
    const request = new EventEmitter()
    const refusal = new SsoConfigurationError('must be publicly reachable')
    mockGet.mockImplementation(() => {
      setImmediate(() => request.emit('error', refusal))
      return request
    })

    await expect(
      fetchMetadataDocument('https://idp.example.com/metadata'),
    ).rejects.toBe(refusal)
  })

  it('aborts a slow request on timeout', async () => {
    const request = Object.assign(new EventEmitter(), { destroy: jest.fn() })
    mockGet.mockImplementation(() => {
      setImmediate(() => request.emit('timeout'))
      return request
    })
    request.destroy.mockImplementation(() =>
      request.emit('error', new Error('socket hang up')),
    )

    await expect(
      fetchMetadataDocument('https://idp.example.com/metadata'),
    ).rejects.toThrow('Could not reach the metadata URL')
    expect(request.destroy).toHaveBeenCalled()
  })

  it('reports a body read failure', async () => {
    const request = new EventEmitter()
    mockGet.mockImplementation((_url, _options, handler) => {
      const response = Object.assign(new EventEmitter(), {
        statusCode: 200,
        resume: jest.fn(),
      })
      handler(response)
      response.emit('error', new Error('reset'))
      return request
    })

    await expect(
      fetchMetadataDocument('https://idp.example.com/metadata'),
    ).rejects.toThrow('Could not read the metadata URL')
  })
})
