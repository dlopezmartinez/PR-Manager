import { prisma } from '../lib/prisma.js';

export async function syncExpiredSubscriptions(): Promise<void> {
  const now = new Date();

  try {
    console.log('[SyncSubscriptions] Starting subscription sync...');

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
      console.log('[SyncSubscriptions] No expired subscriptions found');
      return;
    }

    console.log(`[SyncSubscriptions] Found ${expiredSubscriptions.length} expired subscriptions to update`);

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

    console.log(`[SyncSubscriptions] Updated ${result.count} subscriptions to expired status`);
  } catch (error) {
    console.error('[SyncSubscriptions] Error syncing subscriptions:', error);
    throw error;
  }
}

export async function syncExpiredTrials(): Promise<void> {
  const now = new Date();

  try {
    console.log('[SyncSubscriptions] Starting trial sync...');

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
      console.log('[SyncSubscriptions] No expired trials found');
      return;
    }

    console.log(`[SyncSubscriptions] Found ${expiredTrials.length} expired trials to update`);

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

    console.log(`[SyncSubscriptions] Updated ${result.count} trials to expired status`);
  } catch (error) {
    console.error('[SyncSubscriptions] Error syncing trials:', error);
    throw error;
  }
}

export async function runSubscriptionSync(): Promise<void> {
  try {
    console.log('[SyncSubscriptions] Starting full subscription sync cycle');
    await syncExpiredSubscriptions();
    await syncExpiredTrials();
    console.log('[SyncSubscriptions] Subscription sync cycle completed successfully');
  } catch (error) {
    console.error('[SyncSubscriptions] Subscription sync cycle failed:', error);
  }
}
