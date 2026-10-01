import { AppError } from './app-error'

export const STAFF_SESSION_EXPIRED_ERROR_CODE = 'STAFF_SESSION_EXPIRED'

/** 401: a staff session outlived its maximum age; the staff member must sign in again. */
export class StaffSessionExpiredError extends AppError {
  public readonly code = STAFF_SESSION_EXPIRED_ERROR_CODE

  constructor(
    message = 'Your staff session has expired. Please sign in again',
  ) {
    super(message, 401, true)
  }
}
