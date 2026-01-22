import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  createCheckout,
  getCustomerPortalUrl,
  cancelSubscription as lsCancelSubscription,
  resumeSubscription as lsResumeSubscription,
  LEMONSQUEEZY_CONFIG,
} from '../lib/lemonsqueezy.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * GET /subscription/status
 * Get current user's subscription status
 */
router.get('/status', authenticate, async (req: Request, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!subscription) {
      res.json({
        active: false,
        status: 'none',
        message: 'No active subscription',
      });
      return;
    }

    // Check if subscription is active
    const activeStatuses = ['active', 'on_trial'];
    const isActive = activeStatuses.includes(subscription.status);

    // Check if trial is still valid
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

/**
 * POST /subscription/create-checkout
 * Create a LemonSqueezy Checkout session for subscription
 */
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

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { subscription: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if user already has an active subscription
    if (user.subscription && ['active', 'on_trial'].includes(user.subscription.status)) {
      res.status(400).json({ error: 'You already have an active subscription' });
      return;
    }

    // Get the variant ID based on price selection
    const variantId = priceId === 'monthly'
      ? LEMONSQUEEZY_CONFIG.VARIANT_MONTHLY
      : LEMONSQUEEZY_CONFIG.VARIANT_YEARLY;

    if (!variantId) {
      res.status(500).json({ error: 'Payment configuration error' });
      return;
    }

    // Create checkout
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

/**
 * POST /subscription/manage
 * Get LemonSqueezy Customer Portal URL for subscription management
 */
router.post('/manage', authenticate, async (req: Request, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!subscription || !subscription.lemonSqueezySubscriptionId) {
      res.status(404).json({ error: 'No subscription found' });
      return;
    }

    // Get customer portal URL
    const url = await getCustomerPortalUrl(subscription.lemonSqueezySubscriptionId);

    res.json({ url });
  } catch (error) {
    console.error('Get portal URL error:', error);
    res.status(500).json({ error: 'Failed to get portal URL' });
  }
});

/**
 * POST /subscription/cancel
 * Cancel subscription at period end
 */
router.post('/cancel', authenticate, async (req: Request, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!subscription || !subscription.lemonSqueezySubscriptionId) {
      res.status(404).json({ error: 'No subscription found' });
      return;
    }

    // Cancel via LemonSqueezy
    await lsCancelSubscription(subscription.lemonSqueezySubscriptionId);

    // Update local record
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

/**
 * POST /subscription/reactivate
 * Reactivate a subscription that was set to cancel at period end
 */
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

    // Reactivate via LemonSqueezy
    await lsResumeSubscription(subscription.lemonSqueezySubscriptionId);

    // Update local record
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

export default router;
