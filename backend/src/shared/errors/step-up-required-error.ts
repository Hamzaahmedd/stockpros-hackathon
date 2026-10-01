import { AppError } from './app-error'

export const STEP_UP_REQUIRED_ERROR_CODE = 'STEP_UP_REQUIRED'

/** 403 telling a staff client to verify an emailed code and then retry the action. */
export class StepUpRequiredError extends AppError {
  public readonly code = STEP_UP_REQUIRED_ERROR_CODE

  constructor(message = 'Verify your identity to continue') {
    super(message, 403, true)
  }
}
