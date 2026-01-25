import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    let dbConnected = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch (error) {
      logger.error('Database connection check failed', { error });
    }

    const [totalUsers, activeUsers, suspendedUsers, adminCount, superuserCount] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isSuspended: true } }),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'SUPERUSER' } }),
    ]);

    const activeSessions = await prisma.session.count({
      where: {
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    const [activeSubscriptions, trialSubscriptions, cancelledSubscriptions] = await Promise.all([
      prisma.subscription.count({
        where: {
          status: 'active',
        },
      }),
      prisma.subscription.count({
        where: {
          status: 'on_trial',
        },
      }),
      prisma.subscription.count({
        where: {
          status: 'cancelled',
        },
      }),
    ]);

    const [processedWebhooks, pendingWebhooks, failedWebhooks] = await Promise.all([
      prisma.webhookEvent.count({
        where: {
          processed: true,
        },
      }),
      prisma.webhookEvent.count({
        where: {
          processed: false,
          error: null,
        },
      }),
      prisma.webhookEvent.count({
        where: {
          processed: false,
          error: { not: null },
        },
      }),
    ]);

    const auditLogsCount = await prisma.auditLog.count();

    const responseTime = Date.now() - startTime;

    const health = {
      status: dbConnected ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      database: {
        connected: dbConnected,
        checkTime: `${responseTime}ms`,
      },
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        admin: adminCount,
        superuser: superuserCount,
      },
      sessions: {
        active: activeSessions,
      },
      subscriptions: {
        active: activeSubscriptions,
        trial: trialSubscriptions,
        cancelled: cancelledSubscriptions,
        total: activeSubscriptions + trialSubscriptions + cancelledSubscriptions,
      },
      webhooks: {
        processed: processedWebhooks,
        pending: pendingWebhooks,
        failed: failedWebhooks,
        total: processedWebhooks + pendingWebhooks + failedWebhooks,
      },
      auditLogs: {
        total: auditLogsCount,
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
    };

    res.json(health);
  } catch (error) {
    logger.error('Failed to get health status', { error });
    res.status(500).json({
      status: 'unhealthy',
      error: 'Failed to retrieve health status',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
