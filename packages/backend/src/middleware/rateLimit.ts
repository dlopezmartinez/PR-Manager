import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

export const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => {
    return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  },
  keyGenerator: (req: Request) => {
    const email = req.body?.email || 'anonymous';
    return `login:${email}`;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many login attempts',
      message: 'Please try again in 5 minutes',
      retryAfter: 300,
    });
  },
});

export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many signup attempts',
      message: 'Please try again in 1 hour',
      retryAfter: 3600,
    });
  },
});

export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  keyGenerator: (req: Request) => {
    const email = req.body?.email?.toLowerCase() || 'anonymous';
    return `forgot-password:${email}`;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many password reset requests',
      message: 'Please try again in 1 hour',
      retryAfter: 3600,
    });
  },
});

export const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  keyGenerator: (req: Request) => {
    return `password-change:${req.user?.userId || 'anonymous'}`;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many password change attempts',
      message: 'Please try again in 1 hour',
      retryAfter: 3600,
    });
  },
});

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests from this IP',
      message: 'Please try again later',
      retryAfter: 900,
    });
  },
});

export const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  keyGenerator: (req: Request) => {
    if (req.user?.userId) {
      return `download:${req.user.userId}`;
    }
    return undefined as any;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many downloads',
      message: 'Please try again later',
      retryAfter: 3600,
    });
  },
});

export const publicInfoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Please try again later',
      retryAfter: 60,
    });
  },
});

export const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many checkout attempts',
      message: 'Please try again later',
      retryAfter: 3600,
    });
  },
});

export const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  keyGenerator: (req: Request) => {
    return `admin:${req.user?.userId || 'anonymous'}`;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many admin requests',
      message: 'Please try again later',
      retryAfter: 900,
    });
  },
});

export const subscriptionSyncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  keyGenerator: (req: Request) => {
    return `subscription-sync:${req.user?.userId || 'anonymous'}`;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many sync requests',
      message: 'Please try again in 1 hour',
      retryAfter: 3600,
    });
  },
});
