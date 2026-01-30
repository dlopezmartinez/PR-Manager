import { randomBytes, createHash } from 'crypto';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import {
  RefreshTokenResult,
  VerifyDeviceSessionResult,
  AUTH_ERROR_CODES,
  SubscriptionClaims,
} from '../interfaces/auth.js';
import { generateAccessToken, getSubscriptionClaims } from './tokenService.js';

export async function generateRefreshToken(
  userId: string,
  deviceId: string,
  deviceName?: string
): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  await prisma.session.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  });

  await prisma.session.create({
    data: {
      userId,
      token: tokenHash,
      deviceId,
      deviceName,
      isActive: true,
      lastSyncAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return token;
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
    logger.error('Error verifying refresh token', { error: (error as Error).message });
    return {
      valid: false,
      errorCode: AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID,
      errorMessage: 'Failed to verify refresh token',
    };
  }
}

export async function verifyDeviceSession(
  userId: string,
  deviceId: string
): Promise<VerifyDeviceSessionResult> {
  try {
    let session = await prisma.session.findFirst({
      where: {
        userId,
        deviceId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      const legacySession = await prisma.session.findFirst({
        where: {
          userId,
          deviceId: null,
          isActive: true,
          expiresAt: { gt: new Date() },
        },
      });

      if (legacySession) {
        logger.info('Migrating legacy session', { sessionId: legacySession.id, deviceId });
        session = await prisma.session.update({
          where: { id: legacySession.id },
          data: { deviceId },
        });
      }
    }

    if (!session) {
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
    logger.error('Error verifying device session', { error: (error as Error).message });
    return {
      valid: false,
      errorCode: AUTH_ERROR_CODES.SESSION_REVOKED,
      errorMessage: 'Failed to verify session',
    };
  }
}

export async function updateSessionSync(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { lastSyncAt: new Date() },
  });
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
  const subscription = await getSubscriptionClaims(payload.userId);

  const accessToken = generateAccessToken({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    subscription,
  });

  if (payload.deviceId) {
    const refreshToken = await generateRefreshToken(
      payload.userId,
      payload.deviceId,
      payload.deviceName
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60,
    };
  }

  return {
    accessToken,
    refreshToken: null,
    expiresIn: 7 * 24 * 60 * 60,
  };
}
