import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roles.js';
import { adminRateLimiter } from '../middleware/rateLimit.js';
import { requireAdminSecret } from '../middleware/adminSecret.js';

// Sub-routers
import usersRouter from './admin/users.js';
import sessionsRouter from './admin/sessions.js';
import subscriptionsRouter from './admin/subscriptions.js';
import webhooksRouter from './admin/webhooks.js';
import auditLogsRouter from './admin/auditLogs.js';
import configRouter from './admin/config.js';
import healthRouter from './admin/health.js';

const router = Router();

/**
 * Admin Routes - Access Control (Dual Authentication)
 *
 * Supports TWO ways to authenticate:
 *
 * 1. WITH ADMIN SECRET (personal per-user secrets):
 *    Authorization: AdminSecret your-personal-secret-key
 *    → Created with: npm run admin:create-secret
 *    → Each SUPERUSER gets their own secret(s)
 *    → Tracked in database with audit trail
 *
 * 2. WITH JWT AUTH + SUPERUSER ROLE:
 *    Authorization: Bearer eyJhbGc...
 *    → User must have SUPERUSER role
 *    → Regular JWT authentication flow
 *
 * The middleware chain below ensures both paths work seamlessly.
 */

// First, try to validate admin secret (if provided)
router.use(async (req, res, next) => {
  try {
    await requireAdminSecret(req, res, next);
  } catch (error) {
    console.error('Admin secret middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
});

// Then, require either valid admin secret OR JWT authentication
router.use((req, res, next) => {
  const adminSecretValid = (req as any).adminSecretValid;

  if (adminSecretValid) {
    // Admin secret was valid, allow access
    adminRateLimiter(req, res, next);
  } else {
    // No valid admin secret, require JWT auth + admin role
    authenticate(req, res, () => {
      requireAdmin(req, res, () => {
        adminRateLimiter(req, res, next);
      });
    });
  }
});

// Mount sub-routers
router.use('/users', usersRouter);
router.use('/sessions', sessionsRouter);
router.use('/subscriptions', subscriptionsRouter);
router.use('/webhooks', webhooksRouter);
router.use('/audit-logs', auditLogsRouter);
router.use('/config', configRouter);
router.use('/health', healthRouter);

export default router;
