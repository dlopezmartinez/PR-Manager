import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireSuperuser } from '../../middleware/roles.js';
import { logAudit } from '../../services/auditService.js';
import logger from '../../lib/logger.js';
import { Prisma } from '@prisma/client';
import { getQueryString, toStr } from '../../utils/queryParams.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const configs = await prisma.systemConfig.findMany({
      orderBy: { key: 'asc' },
      select: {
        id: true,
        key: true,
        value: true,
        updatedAt: true,
      },
    });

    res.json({ configs });
  } catch (error) {
    logger.error('Failed to get config', { error });
    res.status(500).json({ error: 'Failed to get config' });
  }
});

router.get('/:key', async (req: Request, res: Response) => {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: toStr(req.params.key) || '' },
      select: {
        id: true,
        key: true,
        value: true,
        updatedAt: true,
      },
    });

    if (!config) {
      res.status(404).json({ error: 'Configuration not found' });
      return;
    }

    res.json(config);
  } catch (error) {
    logger.error('Failed to get config value', { error });
    res.status(500).json({ error: 'Failed to get config value' });
  }
});

router.post('/', requireSuperuser, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      key: z.string().min(1).max(255),
      value: z.any(),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
      return;
    }

    const { key, value } = validation.data;

    const oldConfig = await prisma.systemConfig.findUnique({
      where: { key },
      select: { value: true },
    });

    const config = await prisma.$transaction(async (tx) => {
      const config = await tx.systemConfig.upsert({
        where: { key },
        create: {
          key,
          value: value as Prisma.InputJsonValue,
          updatedBy: req.user!.userId,
        },
        update: {
          value: value as Prisma.InputJsonValue,
          updatedBy: req.user!.userId,
        },
        select: {
          id: true,
          key: true,
          value: true,
          updatedAt: true,
        },
      });

      await logAudit({
        action: 'CONFIG_UPDATED',
        performedBy: req.user!.userId,
        changes: {
          key,
          before: oldConfig?.value,
          after: value,
        },
        metadata: { ip: req.ip },
      });

      return config;
    });

    logger.info('Configuration updated', {
      adminId: req.user!.userId,
      key,
    });

    res.json({
      message: 'Configuration updated',
      config,
    });
  } catch (error) {
    logger.error('Failed to update config', { error });
    res.status(500).json({ error: 'Failed to update config' });
  }
});

router.delete('/:key', requireSuperuser, async (req: Request, res: Response) => {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: toStr(req.params.key) || '' },
      select: { value: true },
    });

    if (!config) {
      res.status(404).json({ error: 'Configuration not found' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.systemConfig.delete({
        where: { key: toStr(req.params.key) || '' },
      });

      await logAudit({
        action: 'CONFIG_UPDATED',
        performedBy: req.user!.userId,
        changes: {
          key: req.params.key,
          before: config.value,
          after: null,
        },
        metadata: { ip: req.ip },
      });
    });

    logger.info('Configuration deleted', {
      adminId: req.user!.userId,
      key: req.params.key,
    });

    res.json({ message: 'Configuration deleted' });
  } catch (error) {
    logger.error('Failed to delete config', { error });
    res.status(500).json({ error: 'Failed to delete config' });
  }
});

export default router;
