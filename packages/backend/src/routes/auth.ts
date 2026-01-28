import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { ApiError, ErrorCodes, validationError, Errors } from '../lib/errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { generateTokens, verifyRefreshToken, authenticate, JWTPayload, AUTH_ERROR_CODES, getSubscriptionClaims, generateAccessToken, verifyDeviceSession, updateSessionSync } from '../middleware/auth.js';
import { loginLimiter, signupLimiter, passwordChangeLimiter, forgotPasswordLimiter } from '../middleware/rateLimit.js';
import { sendEmail } from '../services/emailService.js';
import { passwordResetTemplate } from '../templates/emails.js';

const router = Router();

const signupSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(255, 'Password too long'),
  name: z.string().min(1, 'Name is required').max(255, 'Name too long').optional(),
  // deviceId is optional for web clients (landing page)
  // When provided, enables single-session enforcement
  deviceId: z.string().min(1).max(255, 'Device ID too long').optional(),
  deviceName: z.string().max(255, 'Device name too long').optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  password: z.string().min(1, 'Password is required').max(255, 'Password too long'),
  // deviceId is optional for web clients (landing page)
  // When provided, enables single-session enforcement
  deviceId: z.string().min(1).max(255, 'Device ID too long').optional(),
  deviceName: z.string().max(255, 'Device name too long').optional(),
});

const verifyTokenSchema = z.object({
  token: z.string().min(1, 'Token is required').max(2048, 'Token too long'),
});

// =============================================================================
// POST /auth/signup
// =============================================================================
router.post('/signup', signupLimiter, asyncHandler(async (req: Request, res: Response) => {
  const validation = signupSchema.safeParse(req.body);
  if (!validation.success) {
    throw validationError(validation.error.errors);
  }

  const { email, password, name, deviceId, deviceName } = validation.data;

  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    throw Errors.emailExists();
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Beta mode: create users with BETA role for free access during soft launch
  const isBetaMode = process.env.BETA_MODE === 'true';

  const user = await prisma.$transaction(async (tx) => {
    return await tx.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name,
        ...(isBetaMode && { role: 'BETA' }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });
  });

  const tokens = await generateTokens({
    userId: user.id,
    email: user.email,
    role: user.role,
    deviceId,
    deviceName,
  });

  res.status(201).json({
    accessToken: tokens.accessToken,
    // Only include refreshToken for app logins (when deviceId provided)
    ...(tokens.refreshToken && { refreshToken: tokens.refreshToken }),
    expiresIn: tokens.expiresIn,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}));

// =============================================================================
// POST /auth/login
// =============================================================================
router.post('/login', loginLimiter, asyncHandler(async (req: Request, res: Response) => {
  const validation = loginSchema.safeParse(req.body);
  if (!validation.success) {
    throw validationError(validation.error.errors);
  }

  const { email, password, deviceId, deviceName } = validation.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      role: true,
      isSuspended: true,
      suspendedReason: true,
    },
  });

  if (!user) {
    throw Errors.invalidCredentials();
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    throw Errors.invalidCredentials();
  }

  if (user.isSuspended) {
    throw Errors.userSuspended(user.suspendedReason || undefined);
  }

  const tokens = await generateTokens({
    userId: user.id,
    email: user.email,
    role: user.role,
    deviceId,
    deviceName,
  });

  res.json({
    accessToken: tokens.accessToken,
    // Only include refreshToken for app logins (when deviceId provided)
    ...(tokens.refreshToken && { refreshToken: tokens.refreshToken }),
    expiresIn: tokens.expiresIn,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}));

// =============================================================================
// POST /auth/verify-token
// =============================================================================
router.post('/verify-token', asyncHandler(async (req: Request, res: Response) => {
  const validation = verifyTokenSchema.safeParse(req.body);
  if (!validation.success) {
    throw validationError(validation.error.errors);
  }

  const { token } = validation.data;

  if (!process.env.JWT_SECRET) {
    throw new ApiError({ code: ErrorCodes.SERVER_CONFIG_ERROR });
  }

  let decoded: JWTPayload;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
  } catch {
    throw Errors.tokenInvalid();
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  if (!user) {
    throw Errors.userNotFound();
  }

  res.json({
    valid: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}));

// =============================================================================
// GET /auth/me
// =============================================================================
router.get('/me', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      subscription: {
        select: {
          status: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          trialEndsAt: true,
        },
      },
    },
  });

  if (!user) {
    throw Errors.userNotFound();
  }

  res.json({ user });
}));

// =============================================================================
// GET /auth/health
// =============================================================================
router.get('/health', authenticate, (req: Request, res: Response) => {
  res.json({
    valid: true,
    userId: req.user!.userId,
    timestamp: Date.now(),
  });
});

// =============================================================================
// GET /auth/sync
// Returns a new JWT with updated subscription claims
// Requires X-Device-Id header to verify active session
// =============================================================================
router.get('/sync', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const deviceId = req.headers['x-device-id'] as string;

  if (!deviceId) {
    res.status(400).json({
      error: 'Device ID required',
      code: AUTH_ERROR_CODES.DEVICE_ID_REQUIRED,
    });
    return;
  }

  // Verify this device has an active session
  const sessionResult = await verifyDeviceSession(req.user!.userId, deviceId);

  if (!sessionResult.valid) {
    res.status(403).json({
      error: sessionResult.errorMessage,
      code: sessionResult.errorCode,
    });
    return;
  }

  // Update lastSyncAt for this session
  await updateSessionSync(sessionResult.sessionId!);

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  if (!user) {
    throw Errors.userNotFound();
  }

  // Get fresh subscription claims
  const subscription = await getSubscriptionClaims(user.id);

  // Generate new access token with updated claims
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    subscription,
  });

  res.json({
    accessToken,
    expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
    subscription,
  });
}));

// =============================================================================
// POST /auth/change-password
// =============================================================================
router.post('/change-password', authenticate, passwordChangeLimiter, asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    currentPassword: z.string().min(1, 'Current password is required').max(255, 'Password too long'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters').max(255, 'Password too long'),
  });

  const validation = schema.safeParse(req.body);
  if (!validation.success) {
    throw validationError(validation.error.errors);
  }

  const { currentPassword, newPassword } = validation.data;

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
  });

  if (!user) {
    throw Errors.userNotFound();
  }

  const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!passwordValid) {
    throw new ApiError({ code: ErrorCodes.AUTH_PASSWORD_INCORRECT });
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    await tx.session.deleteMany({
      where: { userId: user.id },
    });
  });

  res.json({ message: 'Password changed successfully' });
}));

// =============================================================================
// POST /auth/refresh
// =============================================================================
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required').max(2048, 'Refresh token too long'),
  });

  const validation = schema.safeParse(req.body);
  if (!validation.success) {
    throw validationError(validation.error.errors);
  }

  const { refreshToken } = validation.data;

  const result = await verifyRefreshToken(refreshToken);

  if (!result.valid || !result.userId) {
    if (result.errorCode === AUTH_ERROR_CODES.USER_SUSPENDED) {
      throw new ApiError({
        code: ErrorCodes.AUTH_USER_SUSPENDED,
        message: result.errorMessage,
      });
    }
    throw new ApiError({ code: ErrorCodes.AUTH_REFRESH_TOKEN_INVALID });
  }

  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  if (!user) {
    throw Errors.userNotFound();
  }

  const tokens = await generateTokens({
    userId: user.id,
    email: user.email,
    role: user.role,
    deviceId: result.deviceId ?? undefined,
    deviceName: result.deviceName ?? undefined,
  });

  res.json({
    accessToken: tokens.accessToken,
    ...(tokens.refreshToken && { refreshToken: tokens.refreshToken }),
    expiresIn: tokens.expiresIn,
  });
}));

// =============================================================================
// POST /auth/logout
// =============================================================================
router.post('/logout', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required').max(2048, 'Refresh token too long'),
  });

  const validation = schema.safeParse(req.body);
  if (!validation.success) {
    // Still return success even if no refresh token provided
    res.json({ message: 'Logged out' });
    return;
  }

  const { refreshToken } = validation.data;

  const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

  await prisma.session.deleteMany({
    where: {
      token: tokenHash,
      userId: req.user!.userId,
    },
  });

  res.json({ message: 'Logged out successfully' });
}));

// =============================================================================
// POST /auth/logout-all
// =============================================================================
router.post('/logout-all', authenticate, asyncHandler(async (req: Request, res: Response) => {
  await prisma.session.deleteMany({
    where: { userId: req.user!.userId },
  });

  res.json({ message: 'Logged out from all devices' });
}));

// =============================================================================
// GET /auth/sessions
// =============================================================================
router.get('/sessions', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const sessions = await prisma.session.findMany({
    where: {
      userId: req.user!.userId,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      isActive: session.expiresAt > new Date(),
    })),
    total: sessions.length,
  });
}));

// =============================================================================
// DELETE /auth/sessions/:id
// =============================================================================
router.delete('/sessions/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];

  const session = await prisma.session.findUnique({
    where: { id },
  });

  if (!session || session.userId !== req.user!.userId) {
    throw new ApiError({ code: ErrorCodes.AUTH_SESSION_NOT_FOUND });
  }

  await prisma.session.delete({
    where: { id },
  });

  res.json({ message: 'Session terminated' });
}));

// =============================================================================
// POST /auth/forgot-password
// =============================================================================
router.post('/forgot-password', forgotPasswordLimiter, asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email().max(255),
  });

  const validation = schema.safeParse(req.body);
  if (!validation.success) {
    // Don't reveal validation errors for security
    res.json({ message: 'If an account exists, a reset email will be sent' });
    return;
  }

  const { email } = validation.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    // Don't reveal if user exists
    res.json({ message: 'If an account exists, a reset email will be sent' });
    return;
  }

  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id },
  });

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token: tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'https://prmanagerhub.com';
  const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset Your Password - PR Manager',
    html: passwordResetTemplate(resetUrl),
  });

  logger.info('Password reset email sent', { email: user.email });
  res.json({ message: 'If an account exists, a reset email will be sent' });
}));

// =============================================================================
// POST /auth/reset-password
// =============================================================================
router.post('/reset-password', asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    token: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(255),
  });

  const validation = schema.safeParse(req.body);
  if (!validation.success) {
    throw validationError(validation.error.errors);
  }

  const { token, newPassword } = validation.data;

  const tokenHash = createHash('sha256').update(token).digest('hex');

  const resetToken = await prisma.passwordResetToken.findFirst({
    where: {
      token: tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!resetToken) {
    throw new ApiError({ code: ErrorCodes.AUTH_RESET_TOKEN_EXPIRED });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    });

    await tx.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    await tx.session.deleteMany({
      where: { userId: resetToken.userId },
    });
  });

  logger.info('Password reset successful', { userId: resetToken.userId });
  res.json({ message: 'Password reset successfully' });
}));

export default router;
