import crypto from 'node:crypto'

/**
 * Computes a SHA-256 hex digest of the given input string.
 * Used for hashing high-entropy tokens (e.g., refresh token jti) before storing in the database.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}
