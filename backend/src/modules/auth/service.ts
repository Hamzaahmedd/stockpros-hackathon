// Consolidated auth service
import { RoleName, UserStatus } from "@prisma/client";
import crypto from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";
import os from "os";
import { uuidv7 } from "uuidv7";
import { NotFoundError, UnauthorizedError } from "../../shared/errors";
import { transporter } from "../../shared/infrastructure/config/email";
import { buildMagicLinkEmail } from '../notifications/email-templates/index';
import config from "../../shared/infrastructure/config/env";
import { prisma } from "../../shared/infrastructure/database";
import { convertToMilliseconds, signToken, verifyRefreshToken } from "../../shared/utils";
import { AuthTokens, UserData } from "./types";

const ACCESS_TOKEN_EXPIRY = config.auth.accessTokenExpiry;
const REFRESH_TOKEN_EXPIRY = config.auth.refreshTokenExpiry;
const ACCESS_TOKEN_SECRET = config.auth.accessTokenSecret;
const REFRESH_TOKEN_SECRET = config.auth.refreshTokenSecret;

export async function generateTokens(userId: string): Promise<AuthTokens> {
    const refreshJti = uuidv7();

    const accessToken = signToken(
      { sub: userId },
      ACCESS_TOKEN_SECRET,
      ACCESS_TOKEN_EXPIRY as SignOptions["expiresIn"]
    );

    const refreshToken = signToken(
      { sub: userId, jti: refreshJti },
      REFRESH_TOKEN_SECRET,
      REFRESH_TOKEN_EXPIRY as SignOptions["expiresIn"]
    );

    return { accessToken, refreshToken, jti: refreshJti };
  }

export async function refreshAccessToken(refreshToken: string) {
    try {
      // Step 1: Basic JWT verification
      const payload = verifyRefreshToken(refreshToken, REFRESH_TOKEN_SECRET);

      // Step 2: Check session in DB
      const session = await prisma.userSession.findUnique({
        where: { jti: payload.jti },
        include: { user: true },
      });

      // Step 3: Enforce force logout
      if (!session || session.isRevoked || new Date() > session.expiresAt) {
        throw new UnauthorizedError("Refresh token expired or invalid");
      }

      // Step 4: Issue new access token
      const { accessToken } = await generateTokens(session.user.id);

      return accessToken;
    } catch (err: unknown) {
      throw new UnauthorizedError("Invalid refresh token");
    }
  }

export async function logoutUser(refreshToken?: string) {
  if (!refreshToken) return null;

  try {
    const decoded = jwt.decode(refreshToken) as { jti?: string } | null;

    if (!decoded?.jti) {
      return null;
    }

    // Find the user session before deleting it
    const session = await prisma.userSession.findUnique({
      where: { jti: decoded.jti },
      select: { userId: true },
    });

    // Delete the session
    await prisma.userSession.deleteMany({
      where: { jti: decoded.jti },
    });

    if (!session) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true },
    });

    return user;
  } catch (error) {
    console.warn("Failed to decode refresh token during logout", error);
    return null;
  }
}

export async function fetchMe(userId: string): Promise<any> {

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      userRoles: {
        include: {
          role: {
            select: {
              name: true
            }
          }
        }
      }
    }
  });

  if (!user) throw new NotFoundError("User not found");

  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    firstName: user.displayName,
    lastName: '',
    userRoles: user.userRoles
  };
}

// ─── Passwordless Magic Link Methods ───────────────────────────────────────────

export function getLocalIpAddress(): string | null {
  try {
    const interfaces = os.networkInterfaces();

    // Adapter names that are VPN tunnels or virtual/host-only adapters
    const virtualAdapterNames = /nordlynx|nordvpn|vmware|vmnet|virtualbox|hyper-v|vethernet|tun\d|tap\d|docker|wsl/i;

    // IP addresses that indicate virtual/host-only adapters:
    //   - .1 suffix on 192.168.x.x (usually router gateway or host-only adapter)
    //   - NordVPN range: 10.5.x.x
    //   - VirtualBox host-only: 192.168.56.x
    const isVirtualIp = (addr: string): boolean => {
      if (/^10\.5\./.test(addr)) return true;         // NordVPN
      if (/^192\.168\.56\./.test(addr)) return true;  // VirtualBox host-only
      if (/^192\.168\.\d+\.1$/.test(addr)) return true; // likely host-only gateway
      return false;
    };

    // Priority names for real physical Wi-Fi / Ethernet adapters
    const preferredNames = /^wi-fi|^wifi|^wlan|^wireless/i;

    // Pass 1: Preferred physical Wi-Fi adapters only
    for (const name of Object.keys(interfaces)) {
      if (virtualAdapterNames.test(name)) continue;
      if (!preferredNames.test(name)) continue;
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal && !isVirtualIp(iface.address)) {
          return iface.address;
        }
      }
    }

    // Pass 2: Any non-virtual, non-internal IPv4 (Ethernet, etc.)
    for (const name of Object.keys(interfaces)) {
      if (virtualAdapterNames.test(name)) continue;
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal && !isVirtualIp(iface.address)) {
          return iface.address;
        }
      }
    }
  } catch {}
  return null;
}

export function resolveFrontendUrl(clientOrigin?: string): string {
  if (config.server.frontendUrl) {
    return config.server.frontendUrl;
  }

  if (config.server.nodeEnv === 'production') {
    throw new Error('FRONTEND_URL must be configured in production to generate magic links');
  }

  return 'http://localhost:5173';
}

export async function generateMagicLink(rawEmail: string, clientOrigin?: string): Promise<void> {
  const email = rawEmail.toLowerCase().trim();

  // 1. Generate a cryptographically secure random raw token (64 hex characters)
  const rawToken = crypto.randomBytes(32).toString('hex');

  // 2. Immediately calculate SHA-256 hash of the token
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  // 3. Set expiration to strictly 10 minutes
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Clean up any existing tokens for this email to avoid clutter
  await prisma.magicLinkToken.deleteMany({
    where: { email },
  });

  // 4. Save ONLY the hash in the database
  await prisma.magicLinkToken.create({
    data: {
      email,
      tokenHash,
      isUsed: false,
      expiresAt,
    },
  });

  // 5. Build accessible login link (supports mobile devices and all browsers)
  const frontendUrl = resolveFrontendUrl(clientOrigin);
  const loginLink = `${frontendUrl}/auth/verify?token=${rawToken}`;

    const emailContent = buildMagicLinkEmail(loginLink, config.auth.magicLinkExpiryMinutes);
  try {
    await transporter.sendMail({
      to: email,
      ...emailContent,
    })
  } catch (mailErr) {
    console.error('[MagicLink] Failed to send email:', mailErr);
    // In development, fallback to console output
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Magic link for ${email}: ${loginLink}`);
    } else {
      // In production, rethrow to propagate error
      throw mailErr;
    }
  }
}

export async function verifyMagicLink(
  rawToken: string,
  ip: string,
  userAgent: string
): Promise<
  | { requiresOnboarding: true; onboardingToken: string; user: null; accessToken: null; refreshToken: null }
  | { requiresOnboarding: false; user: UserData; accessToken: string; refreshToken: string; onboardingToken?: undefined }
> {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new UnauthorizedError('Invalid login link token');
  }

  // 1. Calculate SHA-256 hash of incoming raw token
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const now = new Date();

  // 2. Atomic Verification & Link Death:
  // Atomically find unexpired, unused token and set isUsed = true
  const updateResult = await prisma.magicLinkToken.updateMany({
    where: {
      tokenHash,
      isUsed: false,
      expiresAt: {
        gt: now,
      },
    },
    data: {
      isUsed: true,
    },
  });

  // If update count is 0, the token is either invalid, already used, or expired
  if (updateResult.count === 0) {
    const existing = await prisma.magicLinkToken.findUnique({
      where: { tokenHash },
    });

    if (existing) {
      if (existing.isUsed) {
        throw new UnauthorizedError('This login link has already been used');
      }
      if (existing.expiresAt <= now) {
        await prisma.magicLinkToken.deleteMany({ where: { tokenHash } });
        throw new UnauthorizedError('This login link has expired. Please request a new one');
      }
    }

    throw new UnauthorizedError('Invalid or expired login link');
  }

  // 3. Retrieve the token record to get the associated email
  const magicLink = await prisma.magicLinkToken.findUnique({
    where: { tokenHash },
  });

  if (!magicLink) {
    throw new UnauthorizedError('Login link record not found');
  }

  const email = magicLink.email.toLowerCase().trim();

  // 4. Database Account Match: Query user database table for existing user account
  let user = await prisma.user.findUnique({
    where: { email },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });

  // If user doesn't exist yet — don't auto-create, require onboarding first
  if (!user) {
    // Issue a short-lived onboarding token so the frontend can complete signup
    const onboardingToken = signToken(
      { sub: email, type: 'onboarding' },
      ACCESS_TOKEN_SECRET,
      '15m'
    );

    // Hard delete the used magic-link token
    await prisma.magicLinkToken.deleteMany({ where: { tokenHash } });

    return {
      requiresOnboarding: true,
      onboardingToken,
      user: null,
      accessToken: null,
      refreshToken: null,
    } as any;
  }

  if (user.userRoles.length === 0) {
    // Existing user has no roles — assign default ANALYST role
    const analystRole = await prisma.role.findFirst({
      where: { name: RoleName.ANALYST },
    });

    if (analystRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: analystRole.id,
          assignedById: user.id,
        },
      });

      user = (await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      }))!;
    }
  }

  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedError('Account is inactive or suspended');
  }

  // 5. Jump to current session management setup:
  // Generate access and refresh tokens
  const { accessToken, refreshToken, jti } = await generateTokens(user.id);

  const refreshTokenExpiryMs = convertToMilliseconds(REFRESH_TOKEN_EXPIRY as string) || 604800000;

  // Create active session in database
  await prisma.userSession.create({
    data: {
      userId: user.id,
      jti,
      ipAddress: ip,
      userAgent,
      expiresAt: new Date(Date.now() + refreshTokenExpiryMs),
    },
  });

  // 6. Hard delete the used token record from DB to prevent DB bloating
  await prisma.magicLinkToken.deleteMany({
    where: { tokenHash },
  });

  return {
    requiresOnboarding: false,
    user: {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      firstName: user.displayName,
      lastName: '',
      roleId: user.userRoles?.[0]?.roleId,
      status: user.status,
    },
    accessToken,
    refreshToken,
  };
}

export async function completeOnboarding(
  email: string,
  displayName: string,
  ip: string,
  userAgent: string
): Promise<{ user: UserData; accessToken: string; refreshToken: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  // Create user + assign ANALYST role in a single transaction
  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email: normalizedEmail,
        displayName: displayName.trim(),
        status: UserStatus.ACTIVE,
      },
    });

    const analystRole = await tx.role.findFirst({
      where: { name: RoleName.ANALYST },
    });

    if (!analystRole) {
      throw new Error('Analyst role not found');
    }

    await tx.userRole.create({
      data: {
        userId: createdUser.id,
        roleId: analystRole.id,
        assignedById: createdUser.id,
      },
    });

    return tx.user.findUniqueOrThrow({
      where: { id: createdUser.id },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });
  });

  // Generate session tokens now that signup is complete
  const { accessToken, refreshToken, jti } = await generateTokens(user.id);
  const refreshTokenExpiryMs = convertToMilliseconds(REFRESH_TOKEN_EXPIRY as string) || 604800000;

  await prisma.userSession.create({
    data: {
      userId: user.id,
      jti,
      ipAddress: ip,
      userAgent,
      expiresAt: new Date(Date.now() + refreshTokenExpiryMs),
    },
  });

  return {
    user: {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      firstName: user.displayName,
      lastName: '',
      roleId: user.userRoles?.[0]?.roleId,
      status: user.status,
    },
    accessToken,
    refreshToken,
  };
}
