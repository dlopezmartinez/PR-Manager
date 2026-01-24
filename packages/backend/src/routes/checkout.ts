import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { LEMONSQUEEZY_CONFIG, lemonSqueezyFetch, LemonSqueezyResponse, LemonSqueezyCheckout } from '../lib/lemonsqueezy.js';
import { prisma } from '../lib/prisma.js';
import { generateToken, authenticate } from '../middleware/auth.js';
import { generateAllSignedUrls } from '../lib/signature.js';
import { hasActiveSubscriptionOrIsSuperuser } from '../lib/authorization.js';
import { checkoutLimiter } from '../middleware/rateLimit.js';
import { APP_VERSION } from '../lib/version.js';

const router = Router();

router.post('/create', checkoutLimiter, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      priceId: z.enum(['monthly', 'yearly']),
      email: z.string().email().max(255, 'Email too long').optional(),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    const { priceId, email } = validation.data;

    const variantId = priceId === 'monthly'
      ? LEMONSQUEEZY_CONFIG.VARIANT_MONTHLY
      : LEMONSQUEEZY_CONFIG.VARIANT_YEARLY;

    if (!variantId) {
      res.status(500).json({ error: 'Payment configuration error' });
      return;
    }

    const checkoutData: Record<string, unknown> = {
      custom: {
        plan: priceId,
        source: 'landing',
      },
    };

    if (email) {
      checkoutData.email = email;
    }

    const response = await lemonSqueezyFetch<LemonSqueezyResponse<LemonSqueezyCheckout>>(
      '/checkouts',
      {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'checkouts',
            attributes: {
              checkout_data: checkoutData,
              checkout_options: {
                embed: false,
                media: true,
                button_color: '#0ea5e9',
              },
              product_options: {
                enabled_variants: [parseInt(variantId)],
                redirect_url: `${process.env.FRONTEND_URL || 'https://prmanager.app'}/success`,
              },
              expires_at: null,
            },
            relationships: {
              store: {
                data: {
                  type: 'stores',
                  id: LEMONSQUEEZY_CONFIG.STORE_ID,
                },
              },
              variant: {
                data: {
                  type: 'variants',
                  id: variantId,
                },
              },
            },
          },
        }),
      }
    );

    res.json({
      url: response.data.attributes.url,
      checkoutId: response.data.id,
    });
  } catch (error) {
    console.error('Create public checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

router.post('/verify-session', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email().max(255, 'Email too long'),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Email is required',
        details: validation.error.errors,
      });
      return;
    }

    const { email } = validation.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { subscription: true },
    });

    if (!user) {
      res.status(404).json({
        error: 'User not found. Please create an account first.',
        needsSignup: true,
      });
      return;
    }

    let subscription = user.subscription;
    let attempts = 0;
    const maxAttempts = 5;

    while (!subscription && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      subscription = await prisma.subscription.findUnique({
        where: { userId: user.id },
      });
      attempts++;
    }

    if (!subscription) {
      res.status(404).json({
        error: 'Subscription not found. Please try again in a moment.',
        processing: true,
      });
      return;
    }

    if (!hasActiveSubscriptionOrIsSuperuser(user.role, subscription)) {
      res.status(403).json({
        error: 'Subscription is not active',
        status: subscription.status,
      });
      return;
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const currentVersion = APP_VERSION;
    const apiBaseUrl = process.env.API_BASE_URL || 'https://api.prmanager.app';

    const downloadUrls = generateAllSignedUrls(user.id, currentVersion, apiBaseUrl);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      subscription: {
        active: true,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        isTrialing: subscription.status === 'on_trial',
        trialEndsAt: subscription.trialEndsAt,
      },
      downloads: downloadUrls,
      version: currentVersion,
    });
  } catch (error) {
    console.error('Verify session error:', error);
    res.status(500).json({ error: 'Failed to verify session' });
  }
});

router.get('/downloads', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { subscription: true },
    });

    if (!user) {
      res.status(403).json({ error: 'User not found' });
      return;
    }

    // Allow downloads for any authenticated user
    // The app itself will check subscription status on login
    const currentVersion = APP_VERSION;
    const apiBaseUrl = process.env.API_BASE_URL || 'https://api.prmanager.app';

    const downloadUrls = generateAllSignedUrls(req.user!.userId, currentVersion, apiBaseUrl);

    const hasActiveAccess = hasActiveSubscriptionOrIsSuperuser(user.role, user.subscription);

    res.json({
      downloads: downloadUrls,
      version: currentVersion,
      hasActiveAccess,
      subscriptionStatus: user.subscription?.status || 'none',
    });
  } catch (error) {
    console.error('Get downloads error:', error);
    res.status(500).json({ error: 'Failed to get download URLs' });
  }
});

export default router;
