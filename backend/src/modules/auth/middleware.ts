import { Response, NextFunction } from "express";
import { prisma } from "../../shared/infrastructure/database";
import { AuthenticatedRequest } from "./types";
import { verifyAccessToken } from './utils/jwt';
import { UnauthorizedError } from "../../shared/errors";
import config from "../../shared/infrastructure/config/env";

const ACCESS_TOKEN_SECRET = config.auth.accessTokenSecret;

  export const authTokenMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Get token from Authorization header (Bearer <token>)
      const authHeader = req.headers.authorization;
      const accessToken = authHeader?.startsWith("Bearer ")? authHeader.split(" ")[1]: null;

      if (!accessToken) {
        throw new UnauthorizedError("Access token missing");
      }

      // Verify JWT and get payload
      const payload = verifyAccessToken(accessToken, ACCESS_TOKEN_SECRET);

      // Validate session in DB
      if (payload.jti) {
        const session = await prisma.userSession.findUnique({
          where: { jti: payload.jti },
        });

        if (!session || session.isRevoked || new Date() > session.expiresAt) {
          throw new UnauthorizedError("Session expired or revoked");
        }
      }

      // Attach user info to request
      req.user = { userId: payload.sub, jti: payload.jti };
      next();
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError("Authentication required (Token Expired)");
    }
      next(error);
    }
  };