import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireSuperuser } from '../../middleware/roles.js';
import { logAudit } from '../../services/auditService.js';
import logger from '../../lib/logger.js';
import { z } from 'zod';
import { getQueryNumber, toStr } from '../../utils/queryParams.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, getQueryNumber(req.query.page) || 1);
    const limit = Math.min(Math.max(1, getQueryNumber(req.query.limit) || 50), 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (req.query.status) {
      where.status = String(req.query.status);
    }

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          user: {
            select: { email: true, name: true },
          },
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          lemonSqueezySubscriptionId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.subscription.count({ where }),
    ]);

    res.json({
      subscriptions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Failed to list subscriptions', { error });
    res.status(500).json({ error: 'Failed to list subscriptions' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: toStr(req.params.id) || '' },
      select: {
        id: true,
        userId: true,
        user: {
          select: { email: true, name: true },
        },
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        trialEndsAt: true,
        lemonSqueezyCustomerId: true,
        lemonSqueezySubscriptionId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!subscription) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }

    res.json(subscription);
  } catch (error) {
    logger.error('Failed to get subscription', { error });
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

router.patch(
  '/:id/status',
  requireSuperuser,
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        status: z.enum(['on_trial', 'active', 'paused', 'past_due', 'unpaid', 'cancelled', 'expired']),
      });

      const validation = schema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
        return;
      }

      const subscription = await prisma.subscription.findUnique({
        where: { id: toStr(req.params.id) || '' },
        select: { status: true, userId: true },
      });

      if (!subscription) {
        res.status(404).json({ error: 'Subscription not found' });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const sub = await tx.subscription.update({
          where: { id: toStr(req.params.id) || '' },
          data: { status: validation.data.status },
          select: {
            id: true,
            userId: true,
            status: true,
            updatedAt: true,
          },
        });

        await logAudit({
          action: 'SUBSCRIPTION_UPDATED',
          performedBy: req.user!.userId,
          targetUserId: subscription.userId,
          changes: {
            before: { status: subscription.status },
            after: { status: validation.data.status },
          },
          metadata: { subscriptionId: req.params.id, ip: req.ip },
        });

        return sub;
      });

      logger.info('Subscription status updated', {
        adminId: req.user!.userId,
        subscriptionId: req.params.id,
        newStatus: validation.data.status,
      });

      res.json({ message: 'Subscription status updated', subscription: updated });
    } catch (error) {
      logger.error('Failed to update subscription status', { error });
      res.status(500).json({ error: 'Failed to update subscription status' });
    }
  }
);

export default router;
