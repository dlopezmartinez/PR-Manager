import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export interface SubscriptionClaims {
  active: boolean;
  status: 'active' | 'on_trial' | 'past_due' | 'cancelled' | 'expired' | 'none';
  plan: 'monthly' | 'yearly' | 'lifetime' | 'beta' | null;
  expiresAt: number | null; // Unix timestamp
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  subscription?: SubscriptionClaims;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export const AUTH_ERROR_CODES = {
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  USER_SUSPENDED: 'USER_SUSPENDED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSION_REPLACED: 'SESSION_REPLACED', // Another device logged in
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  DEVICE_ID_REQUIRED: 'DEVICE_ID_REQUIRED',
} as const;

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header required' });
    return;
  }

  const token = authHeader.substring(7);

  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET not configured');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { isSuspended: true, suspendedReason: true },
    });

    if (user?.isSuspended) {
      res.status(403).json({
        error: 'Account suspended',
        code: AUTH_ERROR_CODES.USER_SUSPENDED,
        reason: user.suspendedReason || 'Your account has been suspended',
      });
      return;
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Token expired',
        code: AUTH_ERROR_CODES.TOKEN_EXPIRED,
      });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'Invalid token',
        code: AUTH_ERROR_CODES.TOKEN_INVALID,
      });
      return;
    }
    res.status(401).json({ error: 'Authentication failed' });
  }
}

export function generateAccessToken(payload: {
  userId: string;
  email: string;
  role: UserRole;
  subscription?: SubscriptionClaims;
}): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

export async function getSubscriptionClaims(userId: string): Promise<SubscriptionClaims> {
  // First check if user has LIFETIME, SUPERUSER or BETA role - they always have active access
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user?.role === 'LIFETIME' || user?.role === 'SUPERUSER' || user?.role === 'BETA') {
    return {
      active: true,
      status: 'active',
      plan: user.role === 'BETA' ? 'beta' : 'lifetime',
      expiresAt: null, // Never expires
    };
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription) {
    return {
      active: false,
      status: 'none',
      plan: null,
      expiresAt: null,
    };
  }

  // Map database status to subscription claims status
  let status: SubscriptionClaims['status'];
  switch (subscription.status) {
    case 'active':
      status = 'active';
      break;
    case 'trialing':
      status = 'on_trial';
      break;
    case 'past_due':
      status = 'past_due';
      break;
    case 'canceled':
      status = 'cancelled';
      break;
    default:
      status = 'expired';
  }

  // Determine if subscription is active
  const isActive = ['active', 'trialing'].includes(subscription.status) &&
    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > new Date());

  // Determine plan type from lemonSqueezyVariantId
  let plan: SubscriptionClaims['plan'] = null;
  const variantId = subscription.lemonSqueezyVariantId;
  const monthlyVariantId = process.env.LEMONSQUEEZY_VARIANT_MONTHLY;
  const yearlyVariantId = process.env.LEMONSQUEEZY_VARIANT_YEARLY;

  if (variantId && yearlyVariantId && variantId === yearlyVariantId) {
    plan = 'yearly';
  } else if (variantId && monthlyVariantId && variantId === monthlyVariantId) {
    plan = 'monthly';
  }

  return {
    active: isActive,
    status,
    plan,
    expiresAt: subscription.currentPeriodEnd
      ? Math.floor(subscription.currentPeriodEnd.getTime() / 1000)
      : null,
  };
}

export async function generateRefreshToken(
  userId: string,
  deviceId: string,
  deviceName?: string
): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  // Deactivate all previous sessions for this user (single session policy)
  await prisma.session.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  });

  // Create new active session
  await prisma.session.create({
    data: {
      userId,
      token: tokenHash,
      deviceId,
      deviceName,
      isActive: true,
      lastSyncAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  return token;
}

export async function generateTokens(payload: {
  userId: string;
  email: string;
  role: UserRole;
  deviceId?: string;
  deviceName?: string;
}): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}> {
  // Get subscription claims to embed in JWT
  const subscription = await getSubscriptionClaims(payload.userId);

  const accessToken = generateAccessToken({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    subscription,
  });

  // Only create session and refreshToken for app logins (with deviceId)
  // Landing/web logins only get accessToken (no session, no refreshToken)
  if (payload.deviceId) {
    const refreshToken = await generateRefreshToken(
      payload.userId,
      payload.deviceId,
      payload.deviceName
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
    };
  }

  // Web login - no session, no refreshToken
  return {
    accessToken,
    refreshToken: null,
    expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
  };
}

export interface RefreshTokenResult {
  valid: boolean;
  userId?: string;
  deviceId?: string | null;
  deviceName?: string | null;
  errorCode?: string;
  errorMessage?: string;
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenResult> {
  try {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const session = await prisma.session.findFirst({
      where: {
        token: tokenHash,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            isSuspended: true,
            suspendedReason: true,
          },
        },
      },
    });

    if (!session) {
      return {
        valid: false,
        errorCode: AUTH_ERROR_CODES.SESSION_REVOKED,
        errorMessage: 'Session has been revoked or expired',
      };
    }

    // Check if session was replaced by another device
    if (!session.isActive) {
      return {
        valid: false,
        errorCode: AUTH_ERROR_CODES.SESSION_REPLACED,
        errorMessage: 'Your session was closed because you logged in from another device',
      };
    }

    if (session.user.isSuspended) {
      return {
        valid: false,
        errorCode: AUTH_ERROR_CODES.USER_SUSPENDED,
        errorMessage: session.user.suspendedReason || 'Your account has been suspended',
      };
    }

    return {
      valid: true,
      userId: session.userId,
      deviceId: session.deviceId,
      deviceName: session.deviceName,
    };
  } catch (error) {
    console.error('[Auth] Error verifying refresh token:', error);
    return {
      valid: false,
      errorCode: AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID,
      errorMessage: 'Failed to verify refresh token',
    };
  }
}

export function generateToken(payload: {
  userId: string;
  email: string;
  role: UserRole;
}): string {
  return generateAccessToken(payload);
}

export interface VerifyDeviceSessionResult {
  valid: boolean;
  sessionId?: string;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Verify that a device has an active session for a user.
 * Used during sync to ensure the session hasn't been replaced by another device.
 */
export async function verifyDeviceSession(
  userId: string,
  deviceId: string
): Promise<VerifyDeviceSessionResult> {
  try {
    // First, try to find an active session with this deviceId
    let session = await prisma.session.findFirst({
      where: {
        userId,
        deviceId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      // Check if there's an active session WITHOUT deviceId (legacy session)
      // This handles sessions created before single-session enforcement
      const legacySession = await prisma.session.findFirst({
        where: {
          userId,
          deviceId: null,
          isActive: true,
          expiresAt: { gt: new Date() },
        },
      });

      if (legacySession) {
        // Migrate the legacy session: add deviceId to it
        console.log(`[Auth] Migrating legacy session ${legacySession.id} with deviceId ${deviceId}`);
        session = await prisma.session.update({
          where: { id: legacySession.id },
          data: { deviceId },
        });
      }
    }

    if (!session) {
      // Check if there's an inactive session for this device (was replaced)
      const inactiveSession = await prisma.session.findFirst({
        where: {
          userId,
          deviceId,
          isActive: false,
        },
      });

      if (inactiveSession) {
        return {
          valid: false,
          errorCode: AUTH_ERROR_CODES.SESSION_REPLACED,
          errorMessage: 'Your session was closed because you logged in from another device',
        };
      }

      return {
        valid: false,
        errorCode: AUTH_ERROR_CODES.SESSION_REVOKED,
        errorMessage: 'Session not found or expired',
      };
    }

    return {
      valid: true,
      sessionId: session.id,
    };
  } catch (error) {
    console.error('[Auth] Error verifying device session:', error);
    return {
      valid: false,
      errorCode: AUTH_ERROR_CODES.SESSION_REVOKED,
      errorMessage: 'Failed to verify session',
    };
  }
}

/**
 * Update the lastSyncAt timestamp for a session.
 */
export async function updateSessionSync(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { lastSyncAt: new Date() },
  });
}
