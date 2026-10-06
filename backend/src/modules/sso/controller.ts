import config from '@/config'
import { NextFunction, Request, Response } from 'express'
import { validateOrThrow } from '../../shared/errors'
import { defaultCookieOptions } from '../../shared/infrastructure/config/cookie'
import { logger } from '../../shared/infrastructure/logger'
import { sendSuccess } from '../../shared/utils/api-response'
import { convertToMilliseconds } from '../../shared/utils'
import { exchangeSsoCode, handleSsoCallback, startSsoLogin } from './service'
import { SsoCallbackOutcome, SsoReturnResult } from './types'
import {
  ssoAcsBodyValidator,
  ssoExchangeValidator,
  ssoStartValidator,
  ssoTenantParamValidator,
} from './validation'

/** Where the browser lands after the IdP round trip, relative to the frontend. */
const frontendRedirect = (
  outcome: SsoCallbackOutcome,
  code?: string,
): string => {
  const base = config.server.frontendUrl
  switch (outcome) {
    case SsoCallbackOutcome.LOGIN_READY:
      return `${base}/auth/sso/complete?code=${encodeURIComponent(code ?? '')}`
    case SsoCallbackOutcome.LOGIN_FAILED:
      return `${base}/login?sso=${SsoReturnResult.FAILED}`
    case SsoCallbackOutcome.TEST_PASSED:
      return `${base}/settings/workspace/security?sso_test=${SsoReturnResult.PASSED}`
    case SsoCallbackOutcome.TEST_FAILED:
      return `${base}/settings/workspace/security?sso_test=${SsoReturnResult.FAILED}`
  }
}

export const startLogin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = validateOrThrow(ssoStartValidator, req.body)
    return sendSuccess(res, {
      message: 'SSO sign-in started',
      data: await startSsoLogin(email),
    })
  } catch (error) {
    next(error)
  }
}

/** The IdP posts here. The browser is always sent back to the app; details of a failure are logged, never shown. */
export const acs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = validateOrThrow(ssoTenantParamValidator, req.params)
    const body = ssoAcsBodyValidator.safeParse(req.body)
    if (!body.success) {
      logger.warn('[SSO] malformed callback body', { tenantId })
      return res.redirect(
        303,
        frontendRedirect(SsoCallbackOutcome.LOGIN_FAILED),
      )
    }
    const { outcome, code } = await handleSsoCallback({
      tenantId,
      samlResponse: body.data.SAMLResponse,
      relayState: body.data.RelayState,
    })
    return res.redirect(303, frontendRedirect(outcome, code))
  } catch (error) {
    next(error)
  }
}

export const exchange = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const input = validateOrThrow(ssoExchangeValidator, req.body)
    const result = await exchangeSsoCode(
      input,
      req.ip || 'Unknown',
      req.headers['user-agent'] || 'Unknown',
    )

    if (result.requiresOnboarding) {
      return sendSuccess(res, {
        message: 'Onboarding required to complete SSO registration',
        extra: {
          requiresOnboarding: true,
          onboardingToken: result.onboardingToken,
          defaultDisplayName: result.defaultDisplayName,
        },
      })
    }

    res.cookie('refresh_token', result.refreshToken, {
      ...defaultCookieOptions,
      maxAge: convertToMilliseconds(config.auth.refreshTokenExpiry),
    })
    return sendSuccess(res, {
      message: 'Login successful via SSO',
      extra: {
        requiresOnboarding: false,
        requiresPhoneVerification: result.requiresPhoneVerification,
        user: result.user,
        accessToken: result.accessToken,
      },
    })
  } catch (error) {
    next(error)
  }
}
