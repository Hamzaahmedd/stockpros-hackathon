// Backstop for personal data that ends up in free-text (log messages, error
// messages echoed back by SMTP/HTTP providers). The primary defence is never
// putting an address in a message in the first place; this catches the cases
// nobody thought of, such as "550 <user@example.com>: Recipient rejected".
//
// Both patterns use bounded quantifiers and never let a character class
// contain the separator that follows it, so matching stays linear even on
// adversarial input (no catastrophic backtracking). The final label must be
// alphabetic, so version strings such as "pkg@1.2.3" are not mistaken for mail.
const EMAIL_PATTERN =
  /[A-Z0-9._%+-]{1,64}@(?:[A-Z0-9-]{1,63}\.){1,8}[A-Z]{2,24}/gi

// International numbers in E.164 form (+923001234567). Bare digit runs are
// deliberately not matched: they are indistinguishable from ids and timestamps.
const E164_PHONE_PATTERN = /\+\d{10,15}\b/g

export const REDACTED_EMAIL = '[redacted-email]'
export const REDACTED_PHONE = '[redacted-phone]'

/** Replaces email addresses and E.164 phone numbers in free text. */
export const redactPii = (text: string): string =>
  text
    .replaceAll(EMAIL_PATTERN, REDACTED_EMAIL)
    .replaceAll(E164_PHONE_PATTERN, REDACTED_PHONE)
