import {
  subscribeToOverageRequired,
  type OverageReason,
  type OverageRequiredDetails,
} from '@/shared/utils/overage-events'
import { useEffect, useState } from 'react'
import { SpendLimitReachedModal } from './SpendLimitReachedModal'
import { TopUpModal } from './TopUpModal'

const REASON_COPY: Record<OverageReason, string> = {
  INSUFFICIENT_CREDITS:
    "You've used your monthly AI quota and your credit balance can't cover another signal.",
  SPEND_LIMIT_REACHED:
    "You've reached your monthly credit spending limit set by your workspace admin.",
  PERSONAL_SPEND_LIMIT_REACHED:
    "You've reached the monthly credit spending limit you set.",
}

/**
 * Mounted once at the app root: opens the top-up dialog whenever any API call
 * comes back `403 OVERAGE_REQUIRED` with `canTopUp` (dispatched from the axios
 * interceptor, which cannot render UI itself).
 */
export function TopUpModalHost() {
  const [details, setDetails] = useState<OverageRequiredDetails | null>(null)

  useEffect(() => subscribeToOverageRequired(setDetails), [])

  const close = () => setDetails(null)

  // More credit would not help here: the user's own limit is what stopped them.
  if (details?.reason === 'PERSONAL_SPEND_LIMIT_REACHED') {
    return (
      <SpendLimitReachedModal
        isOpen
        onClose={close}
        message={REASON_COPY[details.reason]}
      />
    )
  }

  return (
    <TopUpModal
      isOpen={details !== null}
      onClose={close}
      reason={details ? REASON_COPY[details.reason] : undefined}
    />
  )
}
