import { AppError } from './app-error'

/** 503 for load shedding: the server is healthy but has no capacity for this request right now. */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, true)
  }
}
