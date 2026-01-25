import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getAuditLogs } from '../../services/auditService.js';
import logger from '../../lib/logger.js';
import { getQueryNumber, getQueryString } from '../../utils/queryParams.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, getQueryNumber(req.query.page) || 1);
    const limit = Math.min(Math.max(1, getQueryNumber(req.query.limit) || 50), 100);

    const filters: any = {
      page,
      limit,
    };

    if (req.query.action) {
      filters.action = String(req.query.action);
    }

    if (req.query.performedBy) {
      filters.performedBy = String(req.query.performedBy);
    }

    if (req.query.targetUserId) {
      filters.targetUserId = String(req.query.targetUserId);
    }

    if (req.query.startDate) {
      try {
        filters.startDate = new Date(String(req.query.startDate));
        if (isNaN(filters.startDate.getTime())) {
          res.status(400).json({ error: 'Invalid startDate format' });
          return;
        }
      } catch {
        res.status(400).json({ error: 'Invalid startDate format' });
        return;
      }
    }

    if (req.query.endDate) {
      try {
        filters.endDate = new Date(String(req.query.endDate));
        if (isNaN(filters.endDate.getTime())) {
          res.status(400).json({ error: 'Invalid endDate format' });
          return;
        }
      } catch {
        res.status(400).json({ error: 'Invalid endDate format' });
        return;
      }
    }

    const result = await getAuditLogs(filters);

    res.json({
      logs: result.logs,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Failed to list audit logs', { error });
    res.status(500).json({ error: 'Failed to list audit logs' });
  }
});

export default router;
