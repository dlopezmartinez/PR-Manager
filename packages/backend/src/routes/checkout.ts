import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { LEMONSQUEEZY_CONFIG, lemonSqueezyFetch, LemonSqueezyResponse, LemonSqueezyCheckout } from '../lib/lemonsqueezy.js';
import { prisma } from '../lib/prisma.js';
import { generateToken, authenticate } from '../middleware/auth.js';
import { generateAllSignedUrls } from '../lib/signature.js';
import { hasActiveSubscriptionOrIsSuperuser } from '../lib/authorization.js';
import { checkoutLimiter } from '../middleware/rateLimit.js';

const router = Router();

/**
 * POST /checkout/create
 * Create a public LemonSqueezy Checkout session (no auth required)
 * Used by landing page for new customers
 */
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

    // Get the variant ID based on price selection
    const variantId = priceId === 'monthly'
      ? LEMONSQUEEZY_CONFIG.VARIANT_MONTHLY
      : LEMONSQUEEZY_CONFIG.VARIANT_YEARLY;

    if (!variantId) {
      res.status(500).json({ error: 'Payment configuration error' });
      return;
    }

    // Create checkout without requiring user account
    // LemonSqueezy will collect email during checkout if not provided
    const checkoutData: Record<string, unknown> = {
      custom: {
        plan: priceId,
        source: 'landing',
      },
    };

    // Pre-fill email if provided
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

/**
 * POST /checkout/verify-session
 * Verify a checkout session after payment and return user token + download URLs
 * This is called by the success page after LemonSqueezy redirects back
 */
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

    // Find user by email
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

    // Check subscription status - may need to poll for webhook
    let subscription = user.subscription;
    let attempts = 0;
    const maxAttempts = 5;

    // Poll for subscription if not found (webhook may take a moment)
    while (!subscription && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
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

    // Check if user has active subscription or is SUPERUSER
    if (!hasActiveSubscriptionOrIsSuperuser(user.role, subscription)) {
      res.status(403).json({
        error: 'Subscription is not active',
        status: subscription.status,
      });
      return;
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Get current version (from env or default)
    const currentVersion = process.env.CURRENT_APP_VERSION || '1.0.0';
    const apiBaseUrl = process.env.API_BASE_URL || 'https://api.prmanager.app';

    // Generate signed download URLs
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

/**
 * GET /checkout/downloads
 * Get signed download URLs for authenticated users
 * Requires Bearer token authentication
 */
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

    // Check if user has active subscription or is SUPERUSER
    if (!hasActiveSubscriptionOrIsSuperuser(user.role, user.subscription)) {
      res.status(403).json({
        error: 'Active subscription required',
        status: user.subscription?.status || 'none',
      });
      return;
    }

    const currentVersion = process.env.CURRENT_APP_VERSION || '1.0.0';
    const apiBaseUrl = process.env.API_BASE_URL || 'https://api.prmanager.app';

    const downloadUrls = generateAllSignedUrls(req.user!.userId, currentVersion, apiBaseUrl);

    res.json({
      downloads: downloadUrls,
      version: currentVersion,
    });
  } catch (error) {
    console.error('Get downloads error:', error);
    res.status(500).json({ error: 'Failed to get download URLs' });
  }
});

export default router;
