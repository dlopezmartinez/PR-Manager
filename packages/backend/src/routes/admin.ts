import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roles.js';
import { adminRateLimiter } from '../middleware/rateLimit.js';
import { requireAdminSecret } from '../middleware/adminSecret.js';
import logger from '../lib/logger.js';

import usersRouter from './admin/users.js';
import sessionsRouter from './admin/sessions.js';
import subscriptionsRouter from './admin/subscriptions.js';
import webhooksRouter from './admin/webhooks.js';
import auditLogsRouter from './admin/auditLogs.js';
import configRouter from './admin/config.js';
import healthRouter from './admin/health.js';

const router = Router();

router.use(async (req, res, next) => {
  try {
    await requireAdminSecret(req, res, next);
  } catch (error) {
    logger.error('Admin secret middleware error', { error: (error as Error).message });
    res.status(500).json({ error: 'Authentication error' });
  }
});

router.use((req, res, next) => {
  const adminSecretValid = (req as any).adminSecretValid;

  if (adminSecretValid) {
    adminRateLimiter(req, res, next);
  } else {
    authenticate(req, res, () => {
      requireAdmin(req, res, () => {
        adminRateLimiter(req, res, next);
      });
    });
  }
});

router.use('/users', usersRouter);
router.use('/sessions', sessionsRouter);
router.use('/subscriptions', subscriptionsRouter);
router.use('/webhooks', webhooksRouter);
router.use('/audit-logs', auditLogsRouter);
router.use('/config', configRouter);
router.use('/health', healthRouter);

export default router;
