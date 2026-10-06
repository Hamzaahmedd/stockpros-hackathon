import crypto from 'node:crypto'
import { z } from 'zod'
import { hashToken } from '../../shared/utils'
import { getKeyValueStore } from './kv-store'
import { SsoFlowPurpose } from './types'

const STATE_TTL_MS = 10 * 60 * 1000
const CODE_TTL_MS = 60 * 1000
const RESPONSE_TTL_MS = 24 * 60 * 60 * 1000

const stateSchema = z.object({
  tenantId: z.string().min(1),
  purpose: z.nativeEnum(SsoFlowPurpose),
  /** sha256 of the browser's binding token (login flows only). */
  bindingHash: z.string().optional(),
  /** The admin and session that started a test flow. */
  actorUserId: z.string().optional(),
  actorSessionId: z.string().optional(),
})
export type SsoFlowState = z.infer<typeof stateSchema>

const codeSchema = z.object({
  tenantId: z.string().min(1),
  email: z.string().min(1),
  bindingHash: z.string().min(1),
})
export type SsoExchangePayload = z.infer<typeof codeSchema>

const randomToken = (): string => crypto.randomBytes(32).toString('base64url')

const parse = <T>(schema: z.ZodType<T>, raw: string | null): T | null => {
  if (raw === null) return null
  try {
    const result = schema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/** Opaque, single-use token the IdP echoes back as RelayState. */
export const createFlowState = async (state: SsoFlowState): Promise<string> => {
  const nonce = randomToken()
  await getKeyValueStore().set(
    `state:${nonce}`,
    JSON.stringify(state),
    STATE_TTL_MS,
  )
  return nonce
}

export const consumeFlowState = async (
  nonce: string,
): Promise<SsoFlowState | null> =>
  parse(stateSchema, await getKeyValueStore().take(`state:${nonce}`))

/** A random secret the initiating browser keeps; only its hash is stored with the flow. */
export const createBinding = (): { token: string; hash: string } => {
  const token = randomToken()
  return { token, hash: hashToken(token) }
}

export const bindingMatches = (
  token: string,
  expectedHash: string,
): boolean => {
  const actual = Buffer.from(hashToken(token))
  const expected = Buffer.from(expectedHash)
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  )
}

/** One-time code the browser swaps, together with its binding token, for a session. */
export const createExchangeCode = async (
  payload: SsoExchangePayload,
): Promise<string> => {
  const code = randomToken()
  await getKeyValueStore().set(
    `code:${code}`,
    JSON.stringify(payload),
    CODE_TTL_MS,
  )
  return code
}

export const consumeExchangeCode = async (
  code: string,
): Promise<SsoExchangePayload | null> =>
  parse(codeSchema, await getKeyValueStore().take(`code:${code}`))

/** True the first time a SAML request id is answered for a tenant, false for any replay. */
export const claimResponse = (
  tenantId: string,
  requestId: string,
): Promise<boolean> =>
  getKeyValueStore().setIfAbsent(
    `response:${tenantId}:${hashToken(requestId)}`,
    '1',
    RESPONSE_TTL_MS,
  )
