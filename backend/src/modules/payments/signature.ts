import config from '@/config'
import crypto from 'node:crypto'

/** Safepay's webhook signature header — note the `sfpy` (not `safepay`) prefix. */
export const SAFEPAY_SIGNATURE_HEADER = 'x-sfpy-signature'

/**
 * Verifies a Safepay webhook's HMAC-SHA512 signature. The signed payload is
 * `JSON.stringify(request.body.data)` — the parsed `data` field
 * re-serialized, NOT the raw request body — confirmed empirically against
 * the official safepay-node SDK's own published test vector
 * (test/fixtures/verify.ts: secret `"foo"`, a specific `data` object, and
 * its expected signature), which only reproduces when hashing
 * `JSON.stringify(body.data)`; hashing the full raw request body produces a
 * different digest and does not match Safepay's own fixture.
 * https://github.com/getsafepay/safepay-node/blob/master/src/resources/verify.ts
 * https://github.com/getsafepay/safepay-node/blob/master/test/fixtures/verify.ts
 */
export function verifySafepaySignature(
  data: unknown,
  signatureHeader: string | string[] | undefined,
): boolean {
  if (
    data === undefined ||
    !signatureHeader ||
    typeof signatureHeader !== 'string'
  ) {
    return false
  }
  if (!config.safepay.webhookSecret) {
    return false
  }

  const payload = Buffer.from(JSON.stringify(data))
  const expected = crypto
    .createHmac('sha512', config.safepay.webhookSecret)
    .update(payload)
    .digest('hex')

  const expectedBuffer = Buffer.from(expected, 'hex')
  const providedBuffer = Buffer.from(signatureHeader, 'hex')

  if (expectedBuffer.length !== providedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer)
}
