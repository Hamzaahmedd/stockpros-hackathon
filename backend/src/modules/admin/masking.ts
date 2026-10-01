import config from '@/config'
import { redactPii } from '../../shared/utils/redact'

const MASK = '***'

/** True when customer identifiers must be hidden from staff until explicitly revealed. */
export const isMaskingEnabled = (): boolean => config.admin.maskCustomerPii

/** `jane.doe@example.com` → `j***@e***.com` */
export const maskEmail = (email: string): string => {
  const at = email.lastIndexOf('@')
  if (at < 1) return MASK
  const domain = email.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  const host = dot > 0 ? domain.slice(0, dot) : domain
  const tld = dot > 0 ? domain.slice(dot) : ''
  return `${email[0]}${MASK}@${host[0] ?? ''}${MASK}${tld}`
}

/** `+923001234567` → `+********4567` (last four digits only). */
export const maskPhone = (phone: string): string => {
  const plus = phone.startsWith('+') ? '+' : ''
  const digits = phone.replaceAll(/\D/g, '')
  if (digits.length <= 4) return MASK
  return `${plus}${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`
}

/** `Sam Lee` → `S*** L***` (initials only). */
export const maskName = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word[0]}${MASK}`)
    .join(' ')

interface Identity {
  email: string
  displayName: string | null
}

/** Masks email and name when masking is on; always reports whether it did. */
export const maskIdentity = <T extends Identity>(
  person: T,
): T & { piiMasked: boolean } => {
  if (!isMaskingEnabled()) return { ...person, piiMasked: false }
  return {
    ...person,
    email: maskEmail(person.email),
    displayName: person.displayName ? maskName(person.displayName) : null,
    piiMasked: true,
  }
}

/**
 * Provider payloads can carry customer emails and phone numbers anywhere in
 * the JSON, so the whole document is scrubbed rather than particular keys.
 */
export const maskPayload = (payload: unknown): unknown => {
  if (!isMaskingEnabled() || payload === null || payload === undefined) {
    return payload
  }
  return JSON.parse(redactPii(JSON.stringify(payload)))
}
