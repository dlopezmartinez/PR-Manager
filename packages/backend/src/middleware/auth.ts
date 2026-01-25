import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
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
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
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
}): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
}

export async function generateRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  await prisma.session.create({
    data: {
      userId,
      token: tokenHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return token;
}

export async function generateTokens(payload: {
  userId: string;
  email: string;
  role: UserRole;
}) {
  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(payload.userId);

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60,
  };
}

export interface RefreshTokenResult {
  valid: boolean;
  userId?: string;
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
