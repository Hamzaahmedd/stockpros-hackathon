import config from '@/config'
import axios, { AxiosError } from 'axios'
import { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import {
    AppError,
    ConflictError,
    InternalServerError,
    NotFoundError,
    ValidationError,
} from '../errors'
import { logger } from '../infrastructure/logger'
import { sendError } from '../utils'

interface LooseError {
  code?: string
  message?: string
  cause?: { code?: string }
  meta?: { code?: string }
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Handle Axios / ML backend errors
  if (axios.isAxiosError(err)) {
    const axiosErr = err as AxiosError
    const data: unknown = axiosErr.response?.data
    const bodyMessage =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message?: unknown }).message)
        : typeof data === 'string'
          ? data
          : undefined
    const mlMessage =
      bodyMessage || axiosErr.message || 'ML service request failed'
    const status = axiosErr.response?.status || 500
    return sendError(res, {
      message: mlMessage,
      statusCode: status,
      errorCode: 'ML_SERVICE_ERROR',
    })
  }

  let error: AppError

  // --- Helpers ---
  const getErrorCode = (e: unknown): string | undefined => {
    const x = e as LooseError
    return x?.code || x?.cause?.code || x?.meta?.code
  }

  const getErrorMessage = (e: unknown): string => {
    const raw = (e as LooseError)?.message || 'Unknown error'
    const match = raw.match(/PostgresError.*message: \"([^\"]+)\"/)
    if (match) return match[1]
    return raw.split('\n').slice(-1)[0]
  }

  // Handle known error types
  if (err instanceof AppError) {
    error = err
  } else if (err instanceof ZodError) {
    error = new ValidationError('Validation failed', err.issues)
  } else {
    const code = getErrorCode(err)
    const msg = getErrorMessage(err)

    switch (code) {
      // Critical infrastructure error
      case 'ECONNRESET':
      case 'ECONNABORTED':
      case 'ESOCKETTIMEDOUT':
      case 'ETIMEDOUT':
        error = new InternalServerError('Connection failed or timed out.')
        break

      // Prisma Errors
      case 'P2000':
        error = new ValidationError('Value too long for field')
        break
      case 'P2002':
        error = new ConflictError('Duplicate entry')
        break
      case 'P2003':
        error = new ConflictError('Foreign key constraint failed')
        break
      case 'P2004':
        error = new ValidationError('Constraint failed')
        break
      case 'P2025':
        error = new NotFoundError('Record not found')
        break
      case 'P2021':
      case 'P2022':
        error = new InternalServerError('Database schema mismatch')
        break
      case 'P2033':
        error = new ValidationError('Invalid data format')
        break

      // Postgres Errors
      case '23505':
        error = new ConflictError('Duplicate entry')
        break
      case '23503':
        error = new ConflictError('Foreign key violation')
        break
      case '23502':
        error = new ValidationError('Missing required field')
        break
      case '22P02':
        error = new ValidationError('Invalid data type')
        break
      case '23514':
        error = new ValidationError('Check constraint violation')
        break
      case 'P0001':
        error = new ValidationError('Business rule violation')
        break

      default:
        error = new InternalServerError(msg || 'Unexpected database error')
        break
    }
  }

  // Log full details for non-operational errors
  if (!error.isOperational && config.server.nodeEnv !== 'production') {
    logger.error('Unexpected error', err)
  }

  return sendError(res, {
    message: error.message,
    statusCode: error.statusCode,
    details: error instanceof ValidationError ? error.details : undefined,
    errorCode: error.name !== 'AppError' ? error.name : undefined,
  })
}
