import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

export async function syncExpiredSubscriptions(): Promise<void> {
  const now = new Date();

  try {
    logger.info('Starting subscription sync');

    const expiredSubscriptions = await prisma.subscription.findMany({
      where: {
        status: {
          in: ['active', 'on_trial'],
        },
        currentPeriodEnd: {
          lt: now,
        },
      },
    });

    if (expiredSubscriptions.length === 0) {
      logger.info('No expired subscriptions found');
      return;
    }

    logger.info('Found expired subscriptions to update', { count: expiredSubscriptions.length });

    const result = await prisma.subscription.updateMany({
      where: {
        status: {
          in: ['active', 'on_trial'],
        },
        currentPeriodEnd: {
          lt: now,
        },
      },
      data: {
        status: 'expired',
      },
    });

    logger.info('Updated subscriptions to expired status', { count: result.count });
  } catch (error) {
    logger.error('Error syncing subscriptions', { error: (error as Error).message });
    throw error;
  }
}

export async function syncExpiredTrials(): Promise<void> {
  const now = new Date();

  try {
    logger.info('Starting trial sync');

    const expiredTrials = await prisma.subscription.findMany({
      where: {
        status: 'on_trial',
        trialEndsAt: {
          not: null,
          lt: now,
        },
      },
    });

    if (expiredTrials.length === 0) {
      logger.info('No expired trials found');
      return;
    }

    logger.info('Found expired trials to update', { count: expiredTrials.length });

    const result = await prisma.subscription.updateMany({
      where: {
        status: 'on_trial',
        trialEndsAt: {
          not: null,
          lt: now,
        },
      },
      data: {
        status: 'expired',
      },
    });

    logger.info('Updated trials to expired status', { count: result.count });
  } catch (error) {
    logger.error('Error syncing trials', { error: (error as Error).message });
    throw error;
  }
}

export async function runSubscriptionSync(): Promise<void> {
  try {
    logger.info('Starting full subscription sync cycle');
    await syncExpiredSubscriptions();
    await syncExpiredTrials();
    logger.info('Subscription sync cycle completed successfully');
  } catch (error) {
    logger.error('Subscription sync cycle failed', { error: (error as Error).message });
  }
}
