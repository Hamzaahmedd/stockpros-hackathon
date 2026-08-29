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

const getErrorCode = (e: unknown): string | undefined => {
  const x = e as LooseError
  return x?.code || x?.cause?.code || x?.meta?.code
}

const extractPostgresMessage = (raw: string): string | undefined => {
  const match = /PostgresError.*message: "([^"]+)"/.exec(raw)
  return match?.[1]
}

const getErrorMessage = (e: unknown): string => {
  const raw = (e as LooseError)?.message || 'Unknown error'
  const lines = raw.split('\n')
  return extractPostgresMessage(raw) || lines.pop() || raw
}

const extractAxiosBodyMessage = (data: unknown): string | undefined => {
  if (typeof data === 'string') return data
  if (typeof data === 'object' && data !== null && 'message' in data) {
    return String((data as { message?: unknown }).message)
  }
  return undefined
}

const handleAxiosError = (err: AxiosError, res: Response): void => {
  const bodyMessage = extractAxiosBodyMessage(err.response?.data)
  const mlMessage = bodyMessage || err.message || 'ML service request failed'
  const status = err.response?.status || 500
  sendError(res, {
    message: mlMessage,
    statusCode: status,
    errorCode: 'ML_SERVICE_ERROR',
  })
}

const mapKnownCodeToError = (code: string | undefined, fallbackMsg: string): AppError => {
  switch (code) {
    case 'ECONNRESET':
    case 'ECONNABORTED':
    case 'ESOCKETTIMEDOUT':
    case 'ETIMEDOUT':
      return new InternalServerError('Connection failed or timed out.')
    case 'P2000':
      return new ValidationError('Value too long for field')
    case 'P2002':
      return new ConflictError('Duplicate entry')
    case 'P2003':
      return new ConflictError('Foreign key constraint failed')
    case 'P2004':
      return new ValidationError('Constraint failed')
    case 'P2025':
      return new NotFoundError('Record not found')
    case 'P2021':
    case 'P2022':
      return new InternalServerError('Database schema mismatch')
    case 'P2033':
      return new ValidationError('Invalid data format')
    case '23505':
      return new ConflictError('Duplicate entry')
    case '23503':
      return new ConflictError('Foreign key violation')
    case '23502':
      return new ValidationError('Missing required field')
    case '22P02':
      return new ValidationError('Invalid data type')
    case '23514':
      return new ValidationError('Check constraint violation')
    case 'P0001':
      return new ValidationError('Business rule violation')
    default:
      return new InternalServerError(fallbackMsg || 'Unexpected database error')
  }
}

const resolveAppError = (err: unknown): AppError => {
  if (err instanceof AppError) return err
  if (err instanceof ZodError) return new ValidationError('Validation failed', err.issues)
  return mapKnownCodeToError(getErrorCode(err), getErrorMessage(err))
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (axios.isAxiosError(err)) {
    handleAxiosError(err, res)
    return
  }

  const error = resolveAppError(err)

  if (!error.isOperational && config.server.nodeEnv !== 'production') {
    logger.error('Unexpected error', err)
  }

  sendError(res, {
    message: error.message,
    statusCode: error.statusCode,
    details: error instanceof ValidationError ? error.details : undefined,
    errorCode: error.name !== 'AppError' ? error.name : undefined,
  })
}
