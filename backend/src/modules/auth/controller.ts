import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { defaultCookieOptions } from '../../shared/infrastructure/config/cookie';
import config from '../../shared/infrastructure/config/env';
import { prisma } from '../../shared/infrastructure/database';
import { UnauthorizedError, NotFoundError, validateOrThrow, ValidationError } from '../../shared/errors';
import {
  logoutUser,
  refreshAccessToken,
  fetchMe,
  generateMagicLink,
  verifyMagicLink,
  completeOnboarding,
} from './service';
import { emailValidator } from './validation';
import { AuthenticatedRequest } from './types';
import { convertToMilliseconds, getUserId } from '../../shared/utils';

export const getMyInfo = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const myDetails = await fetchMe(userId);

    return res.status(200).json({
      success: true,
      message: 'My details fetched successfully',
      user: myDetails,
    });
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies.refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedError('No refresh token provided');
    }

    const accessToken = await refreshAccessToken(refreshToken);

    return res.status(200).json({
      success: true,
      message: 'Access token refreshed successfully',
      accessToken,
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refresh_token || req.body?.refresh_token;
    if (!refreshToken) {
      throw new NotFoundError('No refresh token provided');
    }

    await logoutUser(refreshToken);

    res.clearCookie('refresh_token', defaultCookieOptions);

    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

// ─── Magic Link & Onboarding ──────────────────────────────────────────────────

export const requestMagicLink = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = validateOrThrow(emailValidator, req.body);
    const clientOrigin = req.get('origin') || (req.get('referer') ? new URL(req.get('referer')!).origin : undefined);
    await generateMagicLink(email, clientOrigin);

    return res.status(200).json({
      success: true,
      message: 'If an account with that email exists or can be created, a magic link has been sent.',
    });
  } catch (error) {
    next(error);
  }
};

export const verifyMagicLinkToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      throw new ValidationError('Invalid token');
    }

    const loginResult = await verifyMagicLink(
      token,
      req.ip || 'Unknown',
      req.headers['user-agent'] || 'Unknown'
    );

    if (loginResult.requiresOnboarding) {
      return res.status(200).json({
        success: true,
        message: 'Onboarding required to complete registration',
        requiresOnboarding: true,
        onboardingToken: loginResult.onboardingToken,
      });
    }

    const REFRESH_TOKEN_EXPIRY = convertToMilliseconds(config.auth.refreshTokenExpiry);

    return res
      .status(200)
      .cookie('refresh_token', loginResult.refreshToken, {
        ...defaultCookieOptions,
        maxAge: REFRESH_TOKEN_EXPIRY,
      })
      .json({
        success: true,
        message: 'Login successful via magic link',
        requiresOnboarding: false,
        user: loginResult.user,
        accessToken: loginResult.accessToken,
      });
  } catch (error) {
    next(error);
  }
};

export const completeOnboardingHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { onboardingToken, displayName, firstName, lastName } = req.body;
    const resolvedName = (displayName || [firstName, lastName].filter(Boolean).join(' ') || '').trim();

    if (!resolvedName) {
      throw new ValidationError('Display name / First name is required');
    }

    let email: string | undefined;

    if (onboardingToken && typeof onboardingToken === 'string') {
      try {
        const payload = jwt.verify(onboardingToken, config.auth.accessTokenSecret) as any;
        if (payload.type === 'onboarding' && payload.sub) {
          email = payload.sub as string;
        }
      } catch {
        throw new UnauthorizedError('Invalid or expired onboarding token');
      }
    }

    // If no onboarding token provided, check if user has access token / session
    if (!email) {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
      if (token) {
        try {
          const decoded = jwt.verify(token, config.auth.accessTokenSecret) as any;
          if (decoded?.sub) {
            // User already created, just update their displayName
            const updated = await prisma.user.update({
              where: { id: decoded.sub },
              data: { displayName: resolvedName },
              include: { userRoles: { include: { role: true } } },
            });
            return res.status(200).json({
              success: true,
              message: 'Onboarding completed successfully',
              user: {
                userId: updated.id,
                email: updated.email,
                displayName: updated.displayName,
                roleId: updated.userRoles?.[0]?.roleId,
                status: updated.status,
              },
            });
          }
        } catch {}
      }

      // Check if temporary onboarding email was stored in session or body
      if (req.body.email && typeof req.body.email === 'string') {
        email = req.body.email;
      }
    }

    if (!email) {
      throw new ValidationError('Onboarding token or authentication is required');
    }

    const result = await completeOnboarding(
      email,
      resolvedName,
      req.ip || 'Unknown',
      req.headers['user-agent'] || 'Unknown'
    );

    const REFRESH_TOKEN_EXPIRY = convertToMilliseconds(config.auth.refreshTokenExpiry);

    return res
      .status(201)
      .cookie('refresh_token', result.refreshToken, {
        ...defaultCookieOptions,
        maxAge: REFRESH_TOKEN_EXPIRY,
      })
      .json({
        success: true,
        message: 'Account created successfully',
        user: result.user,
        accessToken: result.accessToken,
      });
  } catch (error) {
    next(error);
  }
};


