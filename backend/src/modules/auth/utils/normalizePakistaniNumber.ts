import { ValidationError } from '../../../shared/errors'

// Local format: 03XXXXXXXXX (11 digits total, starts with 0)
const PK_MOBILE_LOCAL_REGEX = /^03\d{9}$/
// Canonical E.164 digits (no leading '+'): 923XXXXXXXXX (12 digits)
const PK_MOBILE_E164_DIGITS_REGEX = /^923\d{9}$/

/**
 * Normalizes a Pakistani mobile number into the canonical E.164 form
 * `+923XXXXXXXXX`, accepting any of the following input shapes:
 *   - `03001234567`      (local, 11 digits)
 *   - `923001234567`     (no plus, 12 digits)
 *   - `+923001234567`    (already canonical)
 * Spaces, hyphens and parentheses are stripped before parsing. The leading
 * `+` is kept in the returned value — it is only stripped later, at the
 * SendPK HTTP dispatch boundary, never in the stored/normalized value.
 *
 * Throws a ValidationError for anything that doesn't resolve to a valid
 * 11-digit Pakistani mobile number (e.g. other country codes, wrong length).
 */
export function normalizePakistaniNumber(raw: string): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new ValidationError('Phone number is required')
  }

  // Strip spaces, hyphens and parentheses
  const cleaned = raw.trim().replace(/[\s\-()]/g, '')

  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned

  if (!/^\d+$/.test(digits)) {
    throw new ValidationError(
      'Invalid phone number. Please provide a valid Pakistani mobile number (e.g. 03XXXXXXXXX or +923XXXXXXXXX)',
    )
  }

  let e164Digits = digits
  if (PK_MOBILE_LOCAL_REGEX.test(digits)) {
    // 03XXXXXXXXX -> 923XXXXXXXXX
    e164Digits = `92${digits.slice(1)}`
  }

  if (!PK_MOBILE_E164_DIGITS_REGEX.test(e164Digits)) {
    throw new ValidationError(
      'Invalid phone number. Please provide a valid Pakistani mobile number (e.g. 03XXXXXXXXX or +923XXXXXXXXX)',
    )
  }

  return `+${e164Digits}`
}
