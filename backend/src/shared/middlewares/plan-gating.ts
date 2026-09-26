import config from '@/config'
import { AlertType } from '@prisma/client'
import { NextFunction, RequestHandler, Response } from 'express'
import { Action, rbacMiddleware, Resource } from '../../modules/access-control'
import { AuthenticatedRequest } from '../../modules/auth'
import { PlanRequiredError, QuotaExceededError } from '../errors'
import { prisma } from '../infrastructure/database'
import { incrementAndCheckQuota } from '../infrastructure/usage-quota'

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

/** PRO passes through unconditionally; FREE is capped at `freeDailyLimit` calls/day. */
export const requirePlanOrQuota = (
  feature: string,
  freeDailyLimit: number,
): RequestHandler => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    if (req.user?.plan === 'PRO') return next()

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

/** Hard Pro-only gate, no quota/counter — used for capabilities with no sensible daily count. */
export const requirePlan = (requiredPlan: 'PRO'): RequestHandler => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.user?.plan === requiredPlan) return next()
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
  if (req.user?.plan === 'PRO') return next()

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
  if (req.user?.plan === 'PRO') return next()

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
  if (req.user?.plan === 'PRO') return next()

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
  if (req.user?.plan === 'PRO') return next()

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
