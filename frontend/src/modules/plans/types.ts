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
    /** True for individual Pro users, who set their own limit; members' limits belong to workspace admins. */
    canSetSpendCap: boolean
  } | null
  /** Present when a monthly credit cap applies: a member's (set by an admin) or the individual's own. */
  spendCap: {
    monthlyLimitPaisa: number
    spentPaisa: number
    remainingPaisa: number
  } | null
}

export type UsageHistoryRange = 'current' | 'previous'

/** Whose usage the history aggregates: the caller's own, or the whole workspace (owner/admin). */
export type UsageHistoryScope = 'USER' | 'TEAM'

export type MeteredFeature = 'ai_forecast' | 'ai_decision'

export type UsageHistoryDay = {
  /** Calendar day in the requested time zone, `YYYY-MM-DD`. */
  date: string
  signals: number
  creditSpentPaisa: number
}

export type UsageHistoryFeature = {
  feature: MeteredFeature
  signals: number
  creditSpentPaisa: number
}

export type UsageHistory = {
  plan: 'FREE' | 'PRO' | 'TEAM'
  /** False for FREE: daily quotas apply instead, so there is no history. */
  metered: boolean
  scope: UsageHistoryScope | null
  range: UsageHistoryRange
  timezone: string
  window: {
    start: string
    end: string | null
    source: UsageWindowSource
  } | null
  totals: { signals: number; creditSpentPaisa: number }
  /** Every day of the window so far, zero-filled, oldest first. */
  daily: UsageHistoryDay[]
  byFeature: UsageHistoryFeature[]
}
