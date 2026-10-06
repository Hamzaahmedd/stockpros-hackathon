import { AppError } from './app-error'

export const LOGIN_METHOD_REQUIRED_ERROR_CODE = 'LOGIN_METHOD_REQUIRED'

/** 403 telling a client the user's organization only accepts Google sign-in, so it can steer them there. */
export class LoginMethodRequiredError extends AppError {
  public readonly code = LOGIN_METHOD_REQUIRED_ERROR_CODE

  constructor(message = 'Your organization requires signing in with Google') {
    super(message, 403, true)
  }
}
