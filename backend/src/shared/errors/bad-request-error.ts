import { AppError } from './app-error'

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request') {
    super(message, 400, true)
  }
}
