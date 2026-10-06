import { AppError } from './app-error'

export enum OverageReason {
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  /** The workspace admin's per-member cap. */
  SPEND_LIMIT_REACHED = 'SPEND_LIMIT_REACHED',
  /** The limit an individual Pro user set for themselves. */
  PERSONAL_SPEND_LIMIT_REACHED = 'PERSONAL_SPEND_LIMIT_REACHED',
}

export const OVERAGE_REQUIRED_CODE = 'OVERAGE_REQUIRED'

export interface OverageRequiredDetails {
  code: typeof OVERAGE_REQUIRED_CODE
  reason: OverageReason
  feature: string
  /** Whether the caller may buy credits themselves (false for plain team members). */
  canTopUp: boolean
}

/** 403 raised when the base quota and the relevant credit pool are both exhausted. */
export class OverageRequiredError extends AppError {
  public readonly details: OverageRequiredDetails

  constructor(details: Omit<OverageRequiredDetails, 'code'>) {
    super(
      'Quota exhausted — top up credits to keep using this feature',
      403,
      true,
    )
    this.details = { code: OVERAGE_REQUIRED_CODE, ...details }
  }
}
