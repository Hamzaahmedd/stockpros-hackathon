import type { UserStatus } from '@prisma/client';
import type { SignOptions } from 'jsonwebtoken';

export type TokenExpiry = SignOptions['expiresIn'];
import type * as express from "express";

export interface UserData {
  userId: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  roleId?: string;
  status: UserStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  jti: string;
}

export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
  jti?: string;
}

export interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string
    jti?: string
    roleId?: string
  }
  file?: Express.Multer.File
}
