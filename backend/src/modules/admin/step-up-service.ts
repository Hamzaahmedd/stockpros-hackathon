import config from '@/config'
import crypto from 'node:crypto'
import {
  NotFoundError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import { hashToken } from '../../shared/utils'
import { enqueueStaffStepUpEmail } from '../notifications/public'
import {
  STEP_UP_CODE_TTL_MS,
  STEP_UP_MAX_ATTEMPTS,
  STEP_UP_REQUEST_COOLDOWN_MS,
} from './constants'

export interface StepUpActor {
  userId: string
  sessionId: string
}

const MS_PER_MINUTE = 60_000
const CODE_SPACE = 1_000_000

const generateCode = (): string =>
  crypto.randomInt(0, CODE_SPACE).toString().padStart(6, '0')

const sameHash = (a: string, b: string): boolean =>
  a.length === b.length &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

/**
 * Emails a one-time code that unlocks sensitive admin writes for this session.
 * Only the code's hash is stored. A 60-second cooldown per session, plus the
 * route's write limiter, bounds how many emails anyone can trigger.
 */
export async function requestStepUp(actor: StepUpActor) {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { email: true },
  })
  if (!user) throw new NotFoundError('User not found')

  const now = new Date()
  const latest = await prisma.adminStepUp.findFirst({
    where: { sessionId: actor.sessionId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  if (
    latest &&
    now.getTime() - latest.createdAt.getTime() < STEP_UP_REQUEST_COOLDOWN_MS
  ) {
    throw new TooManyRequestsError(
      'Please wait a minute before requesting another code.',
    )
  }

  const code = generateCode()
  await prisma.$transaction([
    // Only one live code per session.
    prisma.adminStepUp.updateMany({
      where: { sessionId: actor.sessionId, consumedAt: null },
      data: { consumedAt: now },
    }),
    prisma.adminStepUp.create({
      data: {
        userId: actor.userId,
        sessionId: actor.sessionId,
        codeHash: hashToken(code),
        expiresAt: new Date(now.getTime() + STEP_UP_CODE_TTL_MS),
      },
    }),
  ])

  const queued = await enqueueStaffStepUpEmail({
    to: user.email,
    userId: actor.userId,
    code,
    expiryMinutes: STEP_UP_CODE_TTL_MS / MS_PER_MINUTE,
  })
  if (!queued) {
    // Nothing was sent, so do not leave a code (or a cooldown) behind.
    await prisma.adminStepUp.deleteMany({
      where: { sessionId: actor.sessionId, consumedAt: null },
    })
    throw new ServiceUnavailableError(
      'Could not send the verification code. Try again shortly.',
    )
  }

  logger.info('[Admin] step-up code requested', { userId: actor.userId })
  return { expiresInSeconds: STEP_UP_CODE_TTL_MS / 1000 }
}

/** Checks the emailed code and, if right, starts this session's verification window. */
export async function verifyStepUp(actor: StepUpActor, code: string) {
  const challenge = await prisma.adminStepUp.findFirst({
    where: { sessionId: actor.sessionId, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (!challenge) {
    throw new UnauthorizedError('No pending code. Request a new one.')
  }

  const now = new Date()
  if (challenge.expiresAt <= now) {
    throw new UnauthorizedError('This code has expired. Request a new one.')
  }
  if (challenge.attempts >= STEP_UP_MAX_ATTEMPTS) {
    throw new TooManyRequestsError(
      'Too many incorrect attempts. Request a new code.',
    )
  }

  if (!sameHash(hashToken(code), challenge.codeHash)) {
    const { attempts } = await prisma.adminStepUp.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    })
    logger.warn('[Admin] step-up code rejected', {
      userId: actor.userId,
      attempts,
    })
    throw new UnauthorizedError('Incorrect verification code')
  }

  await prisma.$transaction([
    prisma.adminStepUp.update({
      where: { id: challenge.id },
      data: { consumedAt: now },
    }),
    prisma.userSession.update({
      where: { id: actor.sessionId },
      data: { stepUpVerifiedAt: now },
    }),
  ])

  logger.info('[Admin] step-up verified', { userId: actor.userId })
  const windowMs = config.admin.stepUpWindowMinutes * MS_PER_MINUTE
  return { verifiedUntil: new Date(now.getTime() + windowMs).toISOString() }
}
