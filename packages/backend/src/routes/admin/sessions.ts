import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireSuperuser } from '../../middleware/roles.js';
import { logAudit } from '../../services/auditService.js';
import logger from '../../lib/logger.js';
import { getQueryNumber, getQueryString, toStr } from '../../utils/queryParams.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, getQueryNumber(req.query.page) || 1);
    const limit = Math.min(Math.max(1, getQueryNumber(req.query.limit) || 50), 100);
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          user: {
            select: { email: true, name: true },
          },
          createdAt: true,
          expiresAt: true,
        },
      }),
      prisma.session.count(),
    ]);

    res.json({
      sessions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Failed to list sessions', { error });
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 100);
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where: { userId: toStr(req.params.userId) || '' },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          createdAt: true,
          expiresAt: true,
        },
      }),
      prisma.session.count({ where: { userId: toStr(req.params.userId) || '' } }),
    ]);

    res.json({
      sessions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Failed to list user sessions', { error });
    res.status(500).json({ error: 'Failed to list user sessions' });
  }
});

router.delete('/:id', requireSuperuser, async (req: Request, res: Response) => {
  try {
    const session = await prisma.session.findUnique({
      where: { id: toStr(req.params.id) || '' },
      select: { userId: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.session.delete({
        where: { id: toStr(req.params.id) || '' },
      });

      await logAudit({
        action: 'SESSION_REVOKED',
        performedBy: req.user!.userId,
        targetUserId: session.userId,
        metadata: { sessionId: req.params.id, ip: req.ip },
      });
    });

    logger.info('Session revoked', {
      adminId: req.user!.userId,
      sessionId: req.params.id,
      targetUserId: session.userId,
    });

    res.json({ message: 'Session revoked' });
  } catch (error) {
    logger.error('Failed to revoke session', { error });
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

router.delete('/user/:userId/all', requireSuperuser, async (req: Request, res: Response) => {
  try {
    if (req.params.userId === req.user!.userId) {
      res.status(400).json({ error: 'Cannot revoke your own sessions' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: toStr(req.params.userId) || '' },
      select: { id: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const deleted = await tx.session.deleteMany({
        where: { userId: toStr(req.params.userId) || '' },
      });

      await logAudit({
        action: 'SESSION_REVOKED_ALL',
        performedBy: req.user!.userId,
        targetUserId: toStr(req.params.userId),
        changes: { sessionsRevoked: deleted.count },
        metadata: { ip: req.ip },
      });

      return deleted;
    });

    logger.info('All user sessions revoked', {
      adminId: req.user!.userId,
      targetUserId: req.params.userId,
      count: result.count,
    });

    res.json({
      message: `${result.count} sessions revoked`,
      count: result.count,
    });
  } catch (error) {
    logger.error('Failed to revoke all sessions', { error });
    res.status(500).json({ error: 'Failed to revoke all sessions' });
  }
});

export default router;
