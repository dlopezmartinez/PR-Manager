import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { getEnv } from '../lib/env.js';

export {
  SubscriptionClaims,
  JWTPayload,
  RefreshTokenResult,
  VerifyDeviceSessionResult,
  AUTH_ERROR_CODES,
  AuthErrorCode,
} from '../interfaces/auth.js';

import { JWTPayload, AUTH_ERROR_CODES } from '../interfaces/auth.js';

export {
  generateAccessToken,
  getSubscriptionClaims,
  generateToken,
} from '../services/tokenService.js';

export {
  generateRefreshToken,
  verifyRefreshToken,
  verifyDeviceSession,
  updateSessionSync,
  generateTokens,
} from '../services/sessionService.js';

import { verifyAccessToken } from '../services/tokenService.js';

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header required' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = verifyAccessToken(token);

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
