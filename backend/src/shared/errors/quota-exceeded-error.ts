import { AppError } from './app-error'

export interface QuotaExceededDetails {
  feature: string
  limit: number
  remaining: 0
  resetAt: string | null
}

export class QuotaExceededError extends AppError {
  public readonly details: QuotaExceededDetails

  constructor(details: QuotaExceededDetails) {
    super(`Daily limit reached for ${details.feature}`, 429, true)
    this.details = details
  }
}
