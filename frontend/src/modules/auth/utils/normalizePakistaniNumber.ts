// Mirrors backend/src/modules/phone-verification/utils/normalizePakistaniNumber.ts
// so the client can validate/canonicalize before the request ever reaches the
// server. Accepts local (03XXXXXXXXX), no-plus (923XXXXXXXXX), and canonical
// (+923XXXXXXXXX) forms, and always returns the canonical +923XXXXXXXXX form.

const PK_MOBILE_LOCAL_REGEX = /^03\d{9}$/;
const PK_MOBILE_E164_DIGITS_REGEX = /^923\d{9}$/;

export function normalizePakistaniNumber(raw: string): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("Phone number is required");
  }

  const cleaned = raw.trim().replace(/[\s\-()]/g, "");
  const digits = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;

  if (!/^\d+$/.test(digits)) {
    throw new Error(
      "Invalid phone number. Please provide a valid Pakistani mobile number (e.g. 03XXXXXXXXX or +923XXXXXXXXX)"
    );
  }

  let e164Digits = digits;
  if (PK_MOBILE_LOCAL_REGEX.test(digits)) {
    e164Digits = `92${digits.slice(1)}`;
  }

  if (!PK_MOBILE_E164_DIGITS_REGEX.test(e164Digits)) {
    throw new Error(
      "Invalid phone number. Please provide a valid Pakistani mobile number (e.g. 03XXXXXXXXX or +923XXXXXXXXX)"
    );
  }

  return `+${e164Digits}`;
}
