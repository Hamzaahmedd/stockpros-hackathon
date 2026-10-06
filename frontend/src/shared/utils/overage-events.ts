/**
 * The axios interceptor (shared/api/axios.ts) cannot render UI, so a
 * `403 OVERAGE_REQUIRED` with `canTopUp` is broadcast as a window event that
 * `TopUpModalHost` (plans module) listens for.
 */
import { isRecord } from './type-guards'

export const OVERAGE_REQUIRED_CODE = 'OVERAGE_REQUIRED'
export const OVERAGE_REQUIRED_EVENT = 'stockpros:overage-required'

export type OverageReason = 'INSUFFICIENT_CREDITS' | 'SPEND_LIMIT_REACHED'

export type OverageRequiredDetails = {
  code: typeof OVERAGE_REQUIRED_CODE
  reason: OverageReason
  feature: string
  canTopUp: boolean
}

const OVERAGE_REASONS: readonly OverageReason[] = [
  'INSUFFICIENT_CREDITS',
  'SPEND_LIMIT_REACHED',
]

/** Runtime check that an untrusted value (an API body, an event detail) really is overage details. */
export const isOverageRequiredDetails = (
  value: unknown,
): value is OverageRequiredDetails =>
  isRecord(value) &&
  value.code === OVERAGE_REQUIRED_CODE &&
  OVERAGE_REASONS.some((reason) => reason === value.reason) &&
  typeof value.feature === 'string' &&
  typeof value.canTopUp === 'boolean'

/** Calls `handler` for each well-formed overage event; malformed ones are ignored. Returns the unsubscribe. */
export const subscribeToOverageRequired = (
  handler: (details: OverageRequiredDetails) => void,
): (() => void) => {
  const listener = (event: Event) => {
    if (
      event instanceof CustomEvent &&
      isOverageRequiredDetails(event.detail)
    ) {
      handler(event.detail)
    }
  }
  window.addEventListener(OVERAGE_REQUIRED_EVENT, listener)
  return () => window.removeEventListener(OVERAGE_REQUIRED_EVENT, listener)
}

export const dispatchOverageRequired = (details: OverageRequiredDetails) => {
  window.dispatchEvent(
    new CustomEvent<OverageRequiredDetails>(OVERAGE_REQUIRED_EVENT, {
      detail: details,
    }),
  )
}
