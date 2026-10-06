import dns from 'node:dns'
import https from 'node:https'
import net from 'node:net'
import ipaddr from 'ipaddr.js'
import { SsoConfigurationError } from './provider'

const FETCH_TIMEOUT_MS = 5000
export const MAX_METADATA_BYTES = 256 * 1024

// ipaddr.js (1.x) predates the benchmarking block, so it is refused explicitly.
const EXTRA_BLOCKED_IPV4: readonly [ipaddr.IPv4, number][] = [
  ipaddr.IPv4.parseCIDR('198.18.0.0/15'),
]

/** True only for globally routable unicast addresses (IPv4-mapped IPv6 is judged as the IPv4 it carries). */
export const isPublicAddress = (address: string): boolean => {
  if (!ipaddr.isValid(address)) return false
  const parsed = ipaddr.process(address)
  if (parsed.range() !== 'unicast') return false
  return !(
    parsed.kind() === 'ipv4' &&
    EXTRA_BLOCKED_IPV4.some((cidr) => (parsed as ipaddr.IPv4).match(cidr))
  )
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
    // Node never calls `lookup` for an IP literal, so the address in the URL is judged here.
    const host = url.hostname.replace(/^\[|\]$/g, '')
    if (net.isIP(host) !== 0 && !isPublicAddress(host)) {
      return reject(
        new SsoConfigurationError(
          'The metadata URL must be publicly reachable',
        ),
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
