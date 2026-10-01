import { AppError } from './app-error'

export const FEATURE_DISABLED_ERROR_CODE = 'FORBIDDEN_FEATURE_DISABLED'

export class FeatureDisabledError extends AppError {
  public readonly code = FEATURE_DISABLED_ERROR_CODE

  constructor(message = 'This feature is not enabled') {
    super(message, 403, true)
  }
}
