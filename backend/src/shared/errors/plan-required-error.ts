import { AppError } from './app-error'

export interface PlanRequiredDetails {
  requiredPlan: 'PRO'
  reason:
    'WATCHLIST_LIMIT' | 'WATCHLIST_ONLY' | 'PORTFOLIO_LIMIT' | 'PRO_FEATURE'
  [key: string]: unknown
}

export class PlanRequiredError extends AppError {
  public readonly details: PlanRequiredDetails

  constructor(message: string, details: PlanRequiredDetails) {
    super(message, 403, true)
    this.details = details
  }
}
