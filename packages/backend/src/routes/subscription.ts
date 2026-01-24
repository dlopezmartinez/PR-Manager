import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  createCheckout,
  getCustomerPortalUrl,
  cancelSubscription as lsCancelSubscription,
  resumeSubscription as lsResumeSubscription,
  LEMONSQUEEZY_CONFIG,
} from '../lib/lemonsqueezy.js';
import { authenticate } from '../middleware/auth.js';
import { hasActiveSubscription } from '../lib/authorization.js';
import { subscriptionSyncLimiter } from '../middleware/rateLimit.js';
import logger from '../lib/logger.js';

const router = Router();

router.get('/status', authenticate, async (req: Request, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
    });

    // SUPERUSER and LIFETIME bypass subscription
    if (req.user!.role === UserRole.SUPERUSER || req.user!.role === UserRole.LIFETIME) {
      const isSuperuser = req.user!.role === UserRole.SUPERUSER;
      const isLifetime = req.user!.role === UserRole.LIFETIME;
      res.json({
        active: true,
        status: subscription?.status || (isSuperuser ? 'superuser' : 'lifetime'),
        isSuperuser,
        isLifetime,
        message: isLifetime ? 'Lifetime access granted' : 'SUPERUSER access - no subscription required',
        currentPeriodStart: subscription?.currentPeriodStart,
        currentPeriodEnd: subscription?.currentPeriodEnd,
        cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd || false,
        trialEndsAt: subscription?.trialEndsAt,
      });
      return;
    }

    if (!subscription) {
      res.json({
        active: false,
        status: 'none',
        message: 'No active subscription',
      });
      return;
    }

    const isActive = hasActiveSubscription(subscription);

    const isTrialing = subscription.status === 'on_trial';
    const trialDaysLeft = isTrialing && subscription.trialEndsAt
      ? Math.ceil((subscription.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0;

    res.json({
      active: isActive,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      trialEndsAt: subscription.trialEndsAt,
      trialDaysLeft: trialDaysLeft > 0 ? trialDaysLeft : 0,
      isTrialing,
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

router.post('/create-checkout', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      priceId: z.enum(['monthly', 'yearly']),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    const { priceId } = validation.data;

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { subscription: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.subscription && hasActiveSubscription(user.subscription)) {
      res.status(400).json({ error: 'You already have an active subscription' });
      return;
    }

    const variantId = priceId === 'monthly'
      ? LEMONSQUEEZY_CONFIG.VARIANT_MONTHLY
      : LEMONSQUEEZY_CONFIG.VARIANT_YEARLY;

    if (!variantId) {
      res.status(500).json({ error: 'Payment configuration error' });
      return;
    }

    const checkout = await createCheckout(
      variantId,
      user.email,
      user.id,
      { plan: priceId }
    );

    res.json({
      url: checkout.url,
      checkoutId: checkout.checkoutId,
    });
  } catch (error) {
    console.error('Create checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

router.post('/manage', authenticate, async (req: Request, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!subscription || !subscription.lemonSqueezySubscriptionId) {
      res.status(404).json({ error: 'No subscription found' });
      return;
    }

    const url = await getCustomerPortalUrl(subscription.lemonSqueezySubscriptionId);

    res.json({ url });
  } catch (error) {
    console.error('Get portal URL error:', error);
    res.status(500).json({ error: 'Failed to get portal URL' });
  }
});

router.post('/cancel', authenticate, async (req: Request, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!subscription || !subscription.lemonSqueezySubscriptionId) {
      res.status(404).json({ error: 'No subscription found' });
      return;
    }

    await lsCancelSubscription(subscription.lemonSqueezySubscriptionId);

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });

    res.json({
      message: 'Subscription will be canceled at the end of the billing period',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

router.post('/reactivate', authenticate, async (req: Request, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!subscription || !subscription.lemonSqueezySubscriptionId) {
      res.status(404).json({ error: 'No subscription found' });
      return;
    }

    if (!subscription.cancelAtPeriodEnd) {
      res.status(400).json({ error: 'Subscription is not scheduled for cancellation' });
      return;
    }

    await lsResumeSubscription(subscription.lemonSqueezySubscriptionId);

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: false },
    });

    res.json({
      message: 'Subscription reactivated successfully',
      cancelAtPeriodEnd: false,
    });
  } catch (error) {
    console.error('Reactivate subscription error:', error);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
});

router.post('/sync', authenticate, subscriptionSyncLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      res.status(404).json({ error: 'No subscription found' });
      return;
    }

    if (!process.env.LEMONSQUEEZY_API_KEY) {
      res.status(500).json({ error: 'Payment provider not configured' });
      return;
    }

    const response = await fetch(
      `https://api.lemonsqueezy.com/v1/subscriptions/${subscription.lemonSqueezySubscriptionId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
          'Accept': 'application/vnd.api+json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[Subscription] Sync failed', { status: response.status, error: errorText });
      res.status(500).json({ error: 'Failed to sync with payment provider' });
      return;
    }

    const data = await response.json() as {
      data: {
        attributes: {
          status: string;
          renews_at: string | null;
          cancelled: boolean;
          trial_ends_at: string | null;
        };
      };
    };
    const attrs = data.data.attributes;

    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: attrs.status,
        currentPeriodEnd: attrs.renews_at ? new Date(attrs.renews_at) : subscription.currentPeriodEnd,
        cancelAtPeriodEnd: attrs.cancelled || false,
        trialEndsAt: attrs.trial_ends_at ? new Date(attrs.trial_ends_at) : null,
      },
    });

    logger.info(`[Subscription] Synced for user ${userId}: ${attrs.status}`);

    res.json({
      synced: true,
      status: updated.status,
      currentPeriodEnd: updated.currentPeriodEnd,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
    });
  } catch (error) {
    logger.error('Subscription sync error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to sync subscription' });
  }
});

export default router;
