import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireSuperuser } from '../../middleware/roles.js';
import { logAudit } from '../../services/auditService.js';
import logger from '../../lib/logger.js';
import { getQueryNumber, getQueryBoolean, getQueryString, toStr } from '../../utils/queryParams.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, getQueryNumber(req.query.page) || 1);
    const limit = Math.min(Math.max(1, getQueryNumber(req.query.limit) || 50), 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (req.query.processed !== undefined) {
      where.processed = req.query.processed === 'true';
    }

    if (req.query.eventName) {
      where.eventName = String(req.query.eventName);
    }

    const [webhooks, total] = await Promise.all([
      prisma.webhookEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          eventId: true,
          eventName: true,
          processed: true,
          processedAt: true,
          error: true,
          errorCount: true,
          createdAt: true,
        },
      }),
      prisma.webhookEvent.count({ where }),
    ]);

    res.json({
      webhooks,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Failed to list webhooks', { error });
    res.status(500).json({ error: 'Failed to list webhooks' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const webhook = await prisma.webhookEvent.findUnique({
      where: { id: toStr(req.params.id) || '' },
      select: {
        id: true,
        eventId: true,
        eventName: true,
        data: true,
        processed: true,
        processedAt: true,
        error: true,
        errorCount: true,
        createdAt: true,
        queueItem: {
          select: {
            id: true,
            retryCount: true,
            nextRetry: true,
            lastError: true,
          },
        },
      },
    });

    if (!webhook) {
      res.status(404).json({ error: 'Webhook event not found' });
      return;
    }

    res.json(webhook);
  } catch (error) {
    logger.error('Failed to get webhook', { error });
    res.status(500).json({ error: 'Failed to get webhook' });
  }
});

router.post('/:id/retry', requireSuperuser, async (req: Request, res: Response) => {
  try {
    const webhook = await prisma.webhookEvent.findUnique({
      where: { id: toStr(req.params.id) || '' },
      select: { eventId: true, eventName: true, processed: true },
    });

    if (!webhook) {
      res.status(404).json({ error: 'Webhook event not found' });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const event = await tx.webhookEvent.update({
        where: { id: toStr(req.params.id) || '' },
        data: {
          error: null,
          errorCount: 0,
          processed: false,
          processedAt: null,
        },
        select: {
          id: true,
          eventName: true,
          error: true,
          errorCount: true,
        },
      });

      await tx.webhookQueue.upsert({
        where: { webhookEventId: toStr(req.params.id) || '' },
        create: {
          webhookEventId: toStr(req.params.id) || '',
          retryCount: 0,
          nextRetry: new Date(),
        },
        update: {
          retryCount: 0,
          nextRetry: new Date(),
          lastError: null,
        },
      });

      await logAudit({
        action: 'WEBHOOK_REPLAYED',
        performedBy: req.user!.userId,
        changes: {
          eventName: webhook.eventName,
          eventId: webhook.eventId,
        },
        metadata: { webhookId: req.params.id, ip: req.ip },
      });

      return event;
    });

    logger.info('Webhook retry queued', {
      adminId: req.user!.userId,
      webhookId: req.params.id,
      eventName: webhook.eventName,
    });

    res.json({ message: 'Webhook queued for retry', webhook: updated });
  } catch (error) {
    logger.error('Failed to retry webhook', { error });
    res.status(500).json({ error: 'Failed to retry webhook' });
  }
});

export default router;
