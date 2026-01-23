import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate Limiting Middleware
 * Protects against brute force, spam, and DoS attacks
 */

/**
 * Rate limit para Login: máximo 5 intentos cada 5 minutos
 * Protege contra brute force de credenciales
 * Rate limit por email para detectar ataques a cuentas específicas
 */
export const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 5, // máximo 5 requests
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => {
    return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  },
  keyGenerator: (req: Request) => {
    // Rate limit por email (para detectar ataques a cuentas específicas)
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

/**
 * Rate limit para Signup: máximo 3 signups por hora
 * Protege contra spam y creación masiva de cuentas
 * Usa default keyGenerator (basado en IP)
 */
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
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

/**
 * Rate limit para Forgot Password: máximo 3 intentos por hora por email
 * Evita abuse del sistema de recuperación de password
 */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3,
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  keyGenerator: (req: Request) => {
    // Rate limit por email para detectar ataques
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

/**
 * Rate limit para Password Change: máximo 3 intentos por hora por usuario
 * Evita abuse de sistema de cambio de password
 */
export const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3,
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  keyGenerator: (req: Request) => {
    // Rate limit por usuario autenticado
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

/**
 * Rate limit global: máximo 100 requests por 15 minutos
 * Captura abuse general y protege contra DDoS
 * Usa default keyGenerator (basado en IP)
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
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

/**
 * Rate limit para Download: máximo 10 descargas por hora
 * Evita abuse de URLs de descarga firmadas
 * Rate limit por usuario si autenticado, IP si no
 */
export const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10,
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  keyGenerator: (req: Request) => {
    // Rate limit por user ID si autenticado, por defecto usa IP
    if (req.user?.userId) {
      return `download:${req.user.userId}`;
    }
    // Retorna undefined para que use el default (IP)
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

/**
 * Rate limit para Checkout: máximo 5 intentos por hora
 * Evita abuse del endpoint de pago
 * Usa default keyGenerator (basado en IP)
 */
export const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
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

/**
 * Rate limit para Admin: máximo 300 requests cada 15 minutos
 * Más alto que global para permitir operaciones bulk en admin
 * Rate limit por user ID para tracking de acciones admin
 */
export const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300,
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  keyGenerator: (req: Request) => {
    // Rate limit por user ID para tracking
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

/**
 * Rate limit para Subscription Sync: máximo 5 syncs por hora por usuario
 * Evita abuse del endpoint de sincronización manual
 */
export const subscriptionSyncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req: Request) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  keyGenerator: (req: Request) => {
    // Rate limit por user ID
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
