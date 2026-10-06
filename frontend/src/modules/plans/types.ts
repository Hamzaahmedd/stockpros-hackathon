export type SubscriptionPaymentMethod = 'CARD' | 'WALLET'

export type SubscriptionScope = 'USER' | 'TEAM'

export type SubscriptionStatus = 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'CANCELLED'

export type SubscriptionSummary = {
  paymentMethod: SubscriptionPaymentMethod
  autoRenew: boolean
  status: SubscriptionStatus
  currentPeriodEnd: string | null
  gracePeriodEnd: string | null
}

export type CreateCheckoutResult = {
  checkoutUrl: string
  trackerId: string
}

export type VerifyTrackerResult = {
  trackerId: string
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REFUNDED'
  plan: 'FREE' | 'PRO' | 'TEAM'
}

export type CreditLedgerType = 'PURCHASE' | 'OVERAGE_CONSUMPTION' | 'REFUND'

export type CreditLedgerEntry = {
  id: string
  /** Signed paisa: purchases/refunds positive, overage consumption negative. */
  amountPaisa: number
  type: CreditLedgerType
  description: string
  createdAt: string
  /** True when the movement was on the shared workspace pool. */
  isTeamPool: boolean
  /** Workspace-wide view only. */
  memberName?: string
}

export type CreditLedgerPage = {
  scope: SubscriptionScope
  balanceInPaisa: number
  entries: CreditLedgerEntry[]
  nextCursor: string | null
}

export type UsageWindowSource = 'SUBSCRIPTION_PERIOD' | 'CALENDAR_MONTH'

export type UsageSummary = {
  plan: 'FREE' | 'PRO' | 'TEAM'
  /** False for FREE: daily quotas apply instead, so there is no monthly meter. */
  metered: boolean
  quota: {
    limit: number
    used: number
    remaining: number
    windowStart: string
    /** When the allowance resets; already in the past during a grace period. */
    windowEnd: string | null
    windowSource: UsageWindowSource
  } | null
  credits: {
    pool: 'USER' | 'TEAM'
    balanceInPaisa: number
    costPerSignalPaisa: number
    signalsAvailable: number
    /** False for plain team members, who cannot buy credits. */
    canTopUp: boolean
  } | null
  /** Team members with a monthly credit cap only. */
  spendCap: {
    monthlyLimitPaisa: number
    spentPaisa: number
    remainingPaisa: number
  } | null
}
