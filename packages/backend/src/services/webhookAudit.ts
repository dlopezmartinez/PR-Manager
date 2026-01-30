import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import logger from '../lib/logger.js';

export interface WebhookAuditLog {
  eventId: string;
  eventName: string;
  data: Record<string, unknown>;
}

export async function logWebhookEvent(
  eventId: string,
  eventName: string,
  data: Record<string, unknown>
): Promise<string> {
  try {
    const event = await prisma.webhookEvent.create({
      data: {
        eventId,
        eventName,
        data: data as Prisma.InputJsonValue,
        processed: false,
      },
    });

    logger.info('Webhook event logged', { eventName, eventId });
    return event.id;
  } catch (error) {
    const isPrismaUniqueError =
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002';

    const isGenericUniqueError =
      error instanceof Error &&
      (error.message.includes('unique constraint') || error.message.includes('Unique constraint'));

    if (isPrismaUniqueError || isGenericUniqueError) {
      logger.warn('Duplicate webhook event ID, using existing record', { eventId });
      const existing = await prisma.webhookEvent.findUnique({
        where: { eventId },
      });
      if (existing) {
        return existing.id;
      }
    }

    logger.error('Failed to log webhook event', { error: (error as Error).message });
    throw error;
  }
}

export async function markWebhookProcessed(
  webhookEventId: string
): Promise<void> {
  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      processed: true,
      processedAt: new Date(),
    },
  });

  logger.info('Webhook event marked processed', { webhookEventId });
}

export async function logWebhookError(
  webhookEventId: string,
  error: Error | string,
  shouldRetry = true
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);

  const updated = await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      error: errorMessage,
      errorCount: { increment: 1 },
    },
  });

  logger.error('Webhook event error', { webhookEventId, attempt: updated.errorCount, error: errorMessage });

  if (shouldRetry && updated.errorCount < 5) {
    const delayMs = getRetryDelay(updated.errorCount);
    await enqueueForRetry(webhookEventId, delayMs);
  }
}

function getRetryDelay(attemptNumber: number): number {
  const delays = [
    5 * 60 * 1000,
    30 * 60 * 1000,
    2 * 60 * 60 * 1000,
    24 * 60 * 60 * 1000,
  ];

  return delays[Math.min(attemptNumber - 1, delays.length - 1)];
}

export async function enqueueForRetry(
  webhookEventId: string,
  delayMs: number
): Promise<void> {
  const nextRetry = new Date(Date.now() + delayMs);

  const existing = await prisma.webhookQueue.findUnique({
    where: { webhookEventId },
  });

  if (existing) {
    await prisma.webhookQueue.update({
      where: { webhookEventId },
      data: {
        nextRetry,
        retryCount: { increment: 1 },
      },
    });
  } else {
    await prisma.webhookQueue.create({
      data: {
        webhookEventId,
        nextRetry,
        retryCount: 1,
      },
    });
  }

  logger.info('Webhook event enqueued for retry', { webhookEventId, nextRetry: nextRetry.toISOString() });
}

export async function getWebhookEvent(webhookEventId: string) {
  return prisma.webhookEvent.findUnique({
    where: { id: webhookEventId },
    include: {
      queueItem: true,
    },
  });
}

export async function getPendingWebhooks(limit = 100) {
  return prisma.webhookEvent.findMany({
    where: {
      processed: false,
      errorCount: { lt: 5 },
    },
    include: {
      queueItem: true,
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

export async function getFailedWebhooks(limit = 100) {
  return prisma.webhookEvent.findMany({
    where: {
      errorCount: { gte: 5 },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function replayWebhook(webhookEventId: string) {
  const event = await getWebhookEvent(webhookEventId);

  if (!event) {
    throw new Error(`Webhook event not found: ${webhookEventId}`);
  }

  logger.info('Replaying webhook', { webhookEventId });

  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      processed: false,
      error: null,
    },
  });
}
