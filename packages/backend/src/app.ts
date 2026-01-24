import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { initSentry } from './lib/sentry.js';

initSentry();

import authRoutes from './routes/auth.js';
import subscriptionRoutes from './routes/subscription.js';
import webhookRoutes from './routes/webhook.js';
import checkoutRoutes from './routes/checkout.js';
import downloadRoutes from './routes/download.js';
import updatesRoutes from './routes/updates.js';
import adminRoutes from './routes/admin.js';
import {
  loginLimiter,
  signupLimiter,
  globalLimiter,
} from './middleware/rateLimit.js';
import { requestLogger, errorLogger } from './middleware/requestLogger.js';
import logger from './lib/logger.js';

export function createApp() {
  const app = express();

  // Trust proxy for deployments behind reverse proxies (Railway, Vercel, etc.)
  // This is required for express-rate-limit to correctly identify client IPs
  app.set('trust proxy', 1);

  const corsOptions = {
    origin: process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:5173',
      'https://prmanager.app',
      'https://www.prmanager.app',
    ],
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.use(requestLogger);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);
  app.use(express.json());
  app.use(globalLimiter);

  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  app.use('/auth', authRoutes);
  app.use('/subscription', subscriptionRoutes);
  app.use('/checkout', checkoutRoutes);
  app.use('/download', downloadRoutes);
  app.use('/updates', updatesRoutes);
  app.use('/admin', adminRoutes);

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorLogger);
  Sentry.setupExpressErrorHandler(app);

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    const statusCode = res.statusCode !== 200 ? res.statusCode : 500;

    res.status(statusCode).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      ...(req.requestId && { requestId: req.requestId }),
    });
  });

  return app;
}
