import { AppError } from './app-error'

export const IP_NOT_ALLOWED_ERROR_CODE = 'ADMIN_IP_NOT_ALLOWED'

/** 403: the request came from outside the network ranges staff may use. */
export class IpNotAllowedError extends AppError {
  public readonly code = IP_NOT_ALLOWED_ERROR_CODE

  constructor(message = 'Staff access is not allowed from this network') {
    super(message, 403, true)
  }
}
