import dns from 'node:dns'
import { logger } from '../../shared/infrastructure/logger'
import {
  DOMAIN_VERIFICATION_RECORD_PREFIX,
  DOMAIN_VERIFICATION_VALUE_PREFIX,
} from './constants'

export const verificationRecordName = (domain: string): string =>
  `${DOMAIN_VERIFICATION_RECORD_PREFIX}.${domain}`

export const verificationRecordValue = (token: string): string =>
  `${DOMAIN_VERIFICATION_VALUE_PREFIX}${token}`

/**
 * True when `_stockpros-verify.<domain>` has a TXT record carrying the
 * expected token. Missing records (NXDOMAIN/NODATA) and resolver failures
 * both read as "not verified" — the caller can simply retry later.
 */
export async function checkDomainTxtRecord(
  domain: string,
  token: string,
): Promise<boolean> {
  try {
    const records = await dns.promises.resolveTxt(
      verificationRecordName(domain),
    )
    const expected = verificationRecordValue(token)
    return records.some((chunks) => chunks.join('') === expected)
  } catch (error) {
    logger.debug(
      `[Teams] TXT lookup failed for ${domain}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return false
  }
}
