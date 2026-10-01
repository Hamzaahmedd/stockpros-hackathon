import config from '@/config'
import ipaddr from 'ipaddr.js'
import { NextFunction, Request, Response } from 'express'
import { IpNotAllowedError } from '../../shared/errors'
import { logger } from '../../shared/infrastructure/logger'

type Address = ipaddr.IPv4 | ipaddr.IPv6
type Entry =
  | { kind: 'cidr'; range: [Address, number] }
  | { kind: 'exact'; address: Address }

const parseEntry = (raw: string): Entry => {
  const value = raw.trim()
  try {
    if (value.includes('/')) {
      return { kind: 'cidr', range: ipaddr.parseCIDR(value) }
    }
    return { kind: 'exact', address: ipaddr.process(value) }
  } catch {
    throw new Error(
      `Invalid admin.ipAllowlist entry "${value}": expected an IP address or CIDR range`,
    )
  }
}

/** Parses the configured list; throws on a malformed entry so bad config fails loudly. */
export const parseAllowlist = (entries: readonly string[]): Entry[] =>
  entries.map(parseEntry)

const isV4 = (address: Address): address is ipaddr.IPv4 =>
  address.kind() === 'ipv4'

/** CIDR membership, only ever comparing addresses of the same family. */
const inRange = (address: Address, range: [Address, number]): boolean => {
  const [base, bits] = range
  if (isV4(address) && isV4(base)) return address.match([base, bits])
  if (!isV4(address) && !isV4(base)) return address.match([base, bits])
  return false
}

/**
 * True when `ip` falls inside any entry. IPv4-mapped IPv6 addresses
 * (`::ffff:203.0.113.7`, as Node reports IPv4 clients on dual-stack sockets)
 * are normalised to IPv4 first so they match IPv4 entries. An address that
 * cannot be parsed is never allowed.
 */
export const isIpAllowed = (
  ip: string | undefined,
  entries: readonly Entry[],
): boolean => {
  if (!ip) return false
  let address: Address
  try {
    address = ipaddr.process(ip)
  } catch {
    return false
  }
  return entries.some((entry) =>
    entry.kind === 'cidr'
      ? inRange(address, entry.range)
      : address.kind() === entry.address.kind() &&
        address.toString() === entry.address.toString(),
  )
}

// Validate at boot so a typo in config stops the deploy instead of quietly
// locking staff out (or, worse, being skipped).
parseAllowlist(config.admin.ipAllowlist)

/**
 * Restricts the staff panel to the configured networks (office/VPN). Disabled
 * when the list is empty. Relies on Express resolving `req.ip` correctly, which
 * needs `trust proxy` to match the number of reverse proxies in front of the app.
 */
export const requireAllowedIp = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const configured = config.admin.ipAllowlist
  if (configured.length === 0) return next()

  if (isIpAllowed(req.ip, parseAllowlist(configured))) return next()

  // The address itself is not logged: it identifies a person's network.
  logger.warn('[Admin] request blocked by the IP allowlist', {
    path: req.path,
  })
  next(new IpNotAllowedError())
}
