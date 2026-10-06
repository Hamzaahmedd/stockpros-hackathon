import dns from 'node:dns'
import https from 'node:https'
import net from 'node:net'
import { SsoConfigurationError } from './provider'

const FETCH_TIMEOUT_MS = 5000
export const MAX_METADATA_BYTES = 256 * 1024

const IPV4_BLOCKED: readonly (readonly [number, number])[] = [
  // [network as uint32, prefix length]
  [0x00000000, 8], // this network
  [0x0a000000, 8], // private
  [0x64400000, 10], // carrier-grade NAT
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // link-local, including cloud metadata
  [0xac100000, 12], // private
  [0xc0000000, 24], // IETF protocol assignments
  [0xc0a80000, 16], // private
  [0xc6120000, 15], // benchmarking
  [0xe0000000, 4], // multicast
  [0xf0000000, 4], // reserved and broadcast
]

const ipv4ToInt = (address: string): number =>
  address
    .split('.')
    .reduce((total, octet) => (total << 8) + Number(octet), 0) >>> 0

const isBlockedIpv4 = (address: string): boolean => {
  const value = ipv4ToInt(address)
  return IPV4_BLOCKED.some(([network, prefix]) => {
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
    return (value & mask) >>> 0 === network
  })
}

const MAPPED_IPV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i

const isBlockedIpv6 = (address: string): boolean => {
  const lower = address.toLowerCase()
  const mapped = MAPPED_IPV4.exec(lower)
  if (mapped) return isBlockedIpv4(mapped[1])
  return (
    lower === '::' ||
    lower === '::1' ||
    /^f[cd]/.test(lower) || // unique local fc00::/7
    /^fe[89ab]/.test(lower) || // link-local fe80::/10
    /^ff/.test(lower) // multicast
  )
}

/** True only for globally routable unicast addresses. */
export const isPublicAddress = (address: string): boolean => {
  switch (net.isIP(address)) {
    case 4:
      return !isBlockedIpv4(address)
    case 6:
      return !isBlockedIpv6(address)
    default:
      return false
  }
}

/**
 * A DNS lookup that refuses non-public addresses. It is handed to the HTTPS
 * request itself, so the address that was checked is the one connected to
 * (no gap for DNS rebinding).
 */
export const publicOnlyLookup: net.LookupFunction = (
  hostname,
  options,
  callback,
) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0)
    const list = Array.isArray(addresses) ? addresses : []
    const blocked = list.find((entry) => !isPublicAddress(entry.address))
    if (blocked || list.length === 0) {
      return callback(
        new SsoConfigurationError(
          'The metadata URL must be publicly reachable',
        ),
        '',
        0,
      )
    }
    if (options.all) {
      return (
        callback as unknown as (
          error: null,
          addresses: dns.LookupAddress[],
        ) => void
      )(null, list)
    }
    return callback(null, list[0].address, list[0].family)
  })
}

/** Downloads IdP metadata over https only: no redirects, no private addresses, bounded time and size. */
export const fetchMetadataDocument = (rawUrl: string): Promise<string> =>
  new Promise((resolve, reject) => {
    let url: URL
    try {
      url = new URL(rawUrl)
    } catch {
      return reject(new SsoConfigurationError('The metadata URL is not valid'))
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      return reject(
        new SsoConfigurationError('The metadata URL must use https'),
      )
    }

    const request = https.get(
      url,
      { lookup: publicOnlyLookup, timeout: FETCH_TIMEOUT_MS },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume()
          return reject(
            new SsoConfigurationError('The metadata URL did not return 200'),
          )
        }
        const chunks: Buffer[] = []
        let size = 0
        response.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_METADATA_BYTES) {
            request.destroy()
            return reject(
              new SsoConfigurationError('The metadata document is too large'),
            )
          }
          chunks.push(chunk)
        })
        response.on('end', () =>
          resolve(Buffer.concat(chunks).toString('utf8')),
        )
        response.on('error', () =>
          reject(new SsoConfigurationError('Could not read the metadata URL')),
        )
      },
    )
    request.on('timeout', () => request.destroy())
    request.on('error', (error) =>
      reject(
        error instanceof SsoConfigurationError
          ? error
          : new SsoConfigurationError('Could not reach the metadata URL'),
      ),
    )
  })
