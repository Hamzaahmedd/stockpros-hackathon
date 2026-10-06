import {
  subscribeToOverageRequired,
  type OverageReason,
  type OverageRequiredDetails,
} from '@/shared/utils/overage-events'
import { useEffect, useState } from 'react'
import { TopUpModal } from './TopUpModal'

const REASON_COPY: Record<OverageReason, string> = {
  INSUFFICIENT_CREDITS:
    "You've used your monthly AI quota and your credit balance can't cover another signal.",
  SPEND_LIMIT_REACHED:
    "You've reached your monthly credit spending limit set by your workspace admin.",
}

/**
 * Mounted once at the app root: opens the top-up dialog whenever any API call
 * comes back `403 OVERAGE_REQUIRED` with `canTopUp` (dispatched from the axios
 * interceptor, which cannot render UI itself).
 */
export function TopUpModalHost() {
  const [details, setDetails] = useState<OverageRequiredDetails | null>(null)

  useEffect(() => subscribeToOverageRequired(setDetails), [])

  return (
    <TopUpModal
      isOpen={details !== null}
      onClose={() => setDetails(null)}
      reason={details ? REASON_COPY[details.reason] : undefined}
    />
  )
}
