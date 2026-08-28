import { AppError } from './app-error'

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, false)
  }
}
