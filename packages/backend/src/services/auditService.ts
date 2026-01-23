import { prisma } from '../lib/prisma.js';
import { AuditAction, Prisma } from '@prisma/client';
import logger from '../lib/logger.js';

interface LogAuditParams {
  action: AuditAction;
  performedBy: string;
  targetUserId?: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  secretName?: string;
}

export async function logAudit({
  action,
  performedBy,
  targetUserId,
  changes,
  metadata,
}: LogAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        performedBy,
        targetUserId,
        changes: changes ? (changes as Prisma.InputJsonValue) : Prisma.JsonNull,
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    logger.info('Audit log created', { action, performedBy, targetUserId });
  } catch (error) {
    logger.error('Failed to create audit log', { error, action, performedBy });
  }
}

export async function getAuditLogs(filters?: {
  action?: AuditAction;
  performedBy?: string;
  targetUserId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}) {
  const page = filters?.page || 1;
  const limit = Math.min(filters?.limit || 50, 100);
  const skip = (page - 1) * limit;

  const where: Prisma.AuditLogWhereInput = {};
  if (filters?.action) where.action = filters.action;
  if (filters?.performedBy) where.performedBy = filters.performedBy;
  if (filters?.targetUserId) where.targetUserId = filters.targetUserId;
  if (filters?.startDate || filters?.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        targetUser: {
          select: { id: true, email: true, name: true },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}
