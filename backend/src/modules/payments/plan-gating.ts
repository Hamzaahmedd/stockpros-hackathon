import config from '@/config'
import { AlertType, PlanTier } from '@prisma/client'
import { NextFunction, RequestHandler, Response } from 'express'
import { Action, rbacMiddleware, Resource } from '../access-control'
import { AuthenticatedRequest } from '../auth'
import { PlanRequiredError, QuotaExceededError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { incrementAndCheckQuota } from '../../shared/infrastructure/usage-quota'
import {
  getActiveMembership,
  type ActiveMembership,
} from '../../shared/infrastructure/team-access'
import { MeteredFeature } from './constants'
import { consumeAiSignal, type MeterActor } from './credits'
import { hasPaidPlan } from '../../shared/utils/plan'
import { isMarketSpikeWindow } from '../../shared/utils/market-hours'

/**
 * Route-registration-time switch between the existing RBAC check and a
 * plan/tier check. Controlled by `config.features.pricingTiersEnabled` so
 * both flows can be exercised independently in dev/test without touching
 * admin/RBAC-management routes, which always stay RBAC-gated.
 */
export const gate = (
  resource: Resource,
  action: Action,
  tierMiddleware: RequestHandler,
): RequestHandler =>
  config.features.pricingTiersEnabled
    ? tierMiddleware
    : rbacMiddleware(resource, action)

/** No plan restriction in tier mode — used with `gate(...)` for routes that stay open to both plans. */
export const noTierRestriction: RequestHandler = (_req, _res, next) => next()

/**
 * Paid plans pass through (metered against their monthly quota + credits when
 * `metered` is given); FREE is capped at `freeDailyLimit` calls/day.
 */
export const requirePlanOrQuota = (
  feature: string,
  freeDailyLimit: number,
  metered?: MeteredFeature,
): RequestHandler => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    if (hasPaidPlan(req.user?.plan)) {
      return metered ? meterPaidAiSignal(metered)(req, res, next) : next()
    }

    try {
      const result = await incrementAndCheckQuota(
        feature,
        req.user!.userId,
        freeDailyLimit,
      )
      if (!result.allowed) {
        throw new QuotaExceededError({
          feature,
          limit: freeDailyLimit,
          remaining: 0,
          resetAt: result.resetAt,
        })
      }
      if (result.remaining !== null) {
        res.setHeader('X-Quota-Remaining', String(result.remaining))
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}

/** Hard paid-plan gate (PRO or TEAM), no quota/counter — used for capabilities with no sensible daily count. */
export const requirePlan = (requiredPlan: 'PRO'): RequestHandler => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (hasPaidPlan(req.user?.plan)) return next()
    next(
      new PlanRequiredError('This feature requires a Pro plan', {
        requiredPlan,
        reason: 'PRO_FEATURE',
      }),
    )
  }
}

const FREE_WATCHLIST_LIMIT = 10

/** FREE users are capped at FREE_WATCHLIST_LIMIT tracked symbols. */
export const requireWatchlistLimitForFree: RequestHandler = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  if (hasPaidPlan(req.user?.plan)) return next()

  try {
    const count = await prisma.watchlist.count({
      where: { userId: req.user!.userId },
    })
    if (count >= FREE_WATCHLIST_LIMIT) {
      throw new PlanRequiredError(
        `Free plan is limited to ${FREE_WATCHLIST_LIMIT} watchlist symbols`,
        {
          requiredPlan: 'PRO',
          reason: 'WATCHLIST_LIMIT',
          limit: FREE_WATCHLIST_LIMIT,
        },
      )
    }
    next()
  } catch (err) {
    next(err)
  }
}

/** FREE users can only run decision-support on a symbol already in their watchlist; PRO can run it on any symbol. */
export const requireWatchlistMembershipOrPro: RequestHandler = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  if (hasPaidPlan(req.user?.plan)) return next()

  const symbol = (req.params.symbol ??
    req.body?.symbol ??
    req.query?.symbol) as string | undefined
  if (!symbol) return next()

  try {
    const entry = await prisma.watchlist.findFirst({
      where: { userId: req.user!.userId, symbol: symbol.toUpperCase() },
      select: { id: true },
    })
    if (!entry) {
      throw new PlanRequiredError(
        'Free plan can only run decision support on symbols in your watchlist',
        { requiredPlan: 'PRO', reason: 'WATCHLIST_ONLY', symbol },
      )
    }
    next()
  } catch (err) {
    next(err)
  }
}

/** FREE users capped at a single stored portfolio. */
export const requireSinglePortfolioForFree: RequestHandler = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  if (hasPaidPlan(req.user?.plan)) return next()

  try {
    const count = await prisma.portfolio.count({
      where: { userId: req.user!.userId },
    })
    if (count >= 1) {
      throw new PlanRequiredError(
        'Free plan is limited to a single portfolio',
        { requiredPlan: 'PRO', reason: 'PORTFOLIO_LIMIT', limit: 1 },
      )
    }
    next()
  } catch (err) {
    next(err)
  }
}

const FREE_ALERT_TYPES: readonly AlertType[] = [
  AlertType.PRICE_ABOVE,
  AlertType.PRICE_BELOW,
  AlertType.PCT_CHANGE_UP,
  AlertType.PCT_CHANGE_DOWN,
]

/** FREE users may only create price/percentage alerts; the other 8 advanced types require Pro. */
export const requireAlertTypeAllowedForPlan: RequestHandler = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  if (hasPaidPlan(req.user?.plan)) return next()

  const alertType = req.body?.type as AlertType | undefined
  if (alertType && !FREE_ALERT_TYPES.includes(alertType)) {
    return next(
      new PlanRequiredError('This alert type requires a Pro plan', {
        requiredPlan: 'PRO',
        reason: 'PRO_FEATURE',
        alertType,
      }),
    )
  }
  next()
}

/** Runs several handlers in order as one `RequestHandler` (for `gate()`, which takes a single tier middleware). */
export const composeHandlers =
  (...handlers: RequestHandler[]): RequestHandler =>
  (req, res, next) => {
    const run = (index: number, err?: unknown): void => {
      if (err || index === handlers.length) return next(err)
      try {
        const result = handlers[index](req, res, (e?: unknown) =>
          run(index + 1, e),
        )
        if (result instanceof Promise) {
          result.catch((e: unknown) => next(e))
        }
      } catch (e) {
        next(e)
      }
    }
    run(0)
  }

const resolveMembership = async (
  req: AuthenticatedRequest,
): Promise<ActiveMembership | null> => {
  if (req.teamContext) return req.teamContext.membership
  if (req.user?.plan !== PlanTier.TEAM) return null
  return getActiveMembership(req.user.userId)
}

export enum QueuePriority {
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
}

export const QUEUE_PRIORITY_HEADER = 'X-Queue-Priority'

/**
 * Loads the caller's workspace context once per request (org instructions,
 * role, credit cap) and flags TEAM members for high-priority processing during
 * the US open/close volatility windows. There is no request queue yet — the
 * flag is exposed on `req.teamContext` and as `X-Queue-Priority` so whatever
 * dispatches AI work can honour it.
 */
export const attachTeamContext: RequestHandler = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const membership = await resolveMembership(req)
    const priority =
      membership && isMarketSpikeWindow()
        ? QueuePriority.HIGH
        : QueuePriority.NORMAL
    req.teamContext = {
      membership,
      priority,
      isHighPriority: priority === QueuePriority.HIGH,
    }
    if (membership) res.setHeader(QUEUE_PRIORITY_HEADER, priority)
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Metered AI action for PRO/TEAM users: base quota, then spend cap, then
 * credits, else 403 OVERAGE_REQUIRED (see payments/credits.ts). FREE users
 * pass through untouched — they are governed by their own daily quotas.
 */
export const meterPaidAiSignal =
  (feature: MeteredFeature): RequestHandler =>
  async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!hasPaidPlan(req.user?.plan)) return next()

    try {
      const actor: MeterActor = {
        userId: req.user!.userId,
        membership: await resolveMembership(req),
      }
      const candidate =
        req.params?.symbol ?? req.body?.symbol ?? req.query?.symbol
      // Only a plain string is a usable symbol (a query can carry arrays/objects).
      const symbol = typeof candidate === 'string' ? candidate : undefined
      await consumeAiSignal(actor, feature, symbol)
      next()
    } catch (err) {
      next(err)
    }
  }
