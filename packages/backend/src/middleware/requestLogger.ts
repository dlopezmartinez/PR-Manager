import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import logger from '../lib/logger.js';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  req.requestId = requestId;
  req.startTime = Date.now();

  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    const duration = Date.now() - (req.startTime || Date.now());
    const statusCode = res.statusCode;

    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'http';

    const userId = req.user?.userId;

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const clientIp = Array.isArray(ip) ? ip[0] : ip.split(',')[0].trim();

    const logData = {
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode,
      duration,
      ip: clientIp,
      userAgent: req.headers['user-agent']?.substring(0, 100),
      ...(userId && { userId }),
      ...(statusCode >= 400 && { query: req.query }),
    };

    if (req.path === '/health' || req.path === '/health/scheduler') {
      return;
    }

    const message = `${req.method} ${req.path} ${statusCode} ${duration}ms`;

    if (level === 'error') {
      logger.error(message, logData);
    } else if (level === 'warn') {
      logger.warn(message, logData);
    } else {
      logger.http(message, logData);
    }
  });

  next();
}

export function errorLogger(err: Error, req: Request, res: Response, next: NextFunction): void {
  const duration = Date.now() - (req.startTime || Date.now());

  logger.error('Request failed with error', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    duration,
    error: err.message,
    stack: err.stack,
    userId: req.user?.userId,
  });

  next(err);
}
