import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { generateToken, generateTokens, verifyRefreshToken, authenticate, JWTPayload, AUTH_ERROR_CODES } from '../middleware/auth.js';
import { loginLimiter, signupLimiter, passwordChangeLimiter, forgotPasswordLimiter } from '../middleware/rateLimit.js';
import { sendEmail } from '../services/emailService.js';
import { passwordResetTemplate } from '../templates/emails.js';

const router = Router();

const signupSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(255, 'Password too long'),
  name: z.string().min(1, 'Name is required').max(255, 'Name too long').optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  password: z.string().min(1, 'Password is required').max(255, 'Password too long'),
});

const verifyTokenSchema = z.object({
  token: z.string().min(1, 'Token is required').max(2048, 'Token too long'),
});

router.post('/signup', signupLimiter, async (req: Request, res: Response) => {
  try {
    const validation = signupSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    const { email, password, name } = validation.data;

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      res.status(400).json({ error: 'An account with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.$transaction(async (tx) => {
      return await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          name,
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
    });

    res.status(201).json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error('Signup error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to create account' });
  }
});

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    const { email, password } = validation.data;

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
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (user.isSuspended) {
      res.status(403).json({
        error: 'Account suspended',
        code: AUTH_ERROR_CODES.USER_SUSPENDED,
        reason: user.suspendedReason || 'Your account has been suspended',
      });
      return;
    }

    const tokens = await generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error('Login error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to authenticate' });
  }
});

router.post('/verify-token', async (req: Request, res: Response) => {
  try {
    const validation = verifyTokenSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    const { token } = validation.data;

    if (!process.env.JWT_SECRET) {
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
    } catch (error) {
      res.status(401).json({ error: 'Invalid or expired token', valid: false });
      return;
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
      res.status(401).json({ error: 'User not found', valid: false });
      return;
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
  } catch (error) {
    logger.error('Token verification error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to verify token', valid: false });
  }
});

router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
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
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    logger.error('Get user error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

router.get('/health', authenticate, async (req: Request, res: Response) => {
  res.json({
    valid: true,
    userId: req.user!.userId,
    timestamp: Date.now(),
  });
});

router.post('/change-password', authenticate, passwordChangeLimiter, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1, 'Current password is required').max(255, 'Password too long'),
      newPassword: z.string().min(8, 'New password must be at least 8 characters').max(255, 'Password too long'),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    const { currentPassword, newPassword } = validation.data;

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordValid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
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
  } catch (error) {
    logger.error('Change password error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      refreshToken: z.string().min(1, 'Refresh token is required').max(2048, 'Refresh token too long'),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    const { refreshToken } = validation.data;

    const result = await verifyRefreshToken(refreshToken);

    if (!result.valid || !result.userId) {
      const statusCode = result.errorCode === AUTH_ERROR_CODES.USER_SUSPENDED ? 403 : 401;
      res.status(statusCode).json({
        error: result.errorMessage || 'Invalid or expired refresh token',
        code: result.errorCode || AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID,
      });
      return;
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
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const tokens = await generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });
  } catch (error) {
    logger.error('Refresh token error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      refreshToken: z.string().min(1, 'Refresh token is required').max(2048, 'Refresh token too long'),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
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
  } catch (error) {
    logger.error('Logout error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to logout' });
  }
});

router.post('/logout-all', authenticate, async (req: Request, res: Response) => {
  try {
    await prisma.session.deleteMany({
      where: { userId: req.user!.userId },
    });

    res.json({ message: 'Logged out from all devices' });
  } catch (error) {
    logger.error('Logout all error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to logout from all devices' });
  }
});

router.get('/sessions', authenticate, async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    logger.error('Get sessions error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

router.delete('/sessions/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];

    const session = await prisma.session.findUnique({
      where: { id },
    });

    if (!session || session.userId !== req.user!.userId) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    await prisma.session.delete({
      where: { id },
    });

    res.json({ message: 'Session terminated' });
  } catch (error) {
    logger.error('Delete session error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

router.post('/forgot-password', forgotPasswordLimiter, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email().max(255),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.json({ message: 'If an account exists, a reset email will be sent' });
      return;
    }

    const { email } = validation.data;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
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

    const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'https://prmanager.app';
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
    await sendEmail({
      to: user.email,
      subject: 'Reset Your Password - PR Manager',
      html: passwordResetTemplate(resetUrl),
    });

    logger.info('Password reset email sent', { email: user.email });
    res.json({ message: 'If an account exists, a reset email will be sent' });
  } catch (error) {
    logger.error('Forgot password error', { error: error instanceof Error ? error.message : String(error) });
    res.json({ message: 'If an account exists, a reset email will be sent' });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      token: z.string().min(1).max(128),
      newPassword: z.string().min(8).max(255),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
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
      res.status(400).json({ error: 'Invalid or expired token' });
      return;
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
  } catch (error) {
    logger.error('Reset password error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
