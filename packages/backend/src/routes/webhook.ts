import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { verifyLemonSqueezyWebhook, LemonSqueezyWebhookEvent } from '../middleware/lemonsqueezy.js';

const router = Router();

/**
 * POST /webhooks/lemonsqueezy
 * Handle LemonSqueezy webhook events
 * Note: This route uses raw body parsing for signature verification
 */
router.post('/lemonsqueezy', verifyLemonSqueezyWebhook, async (req: Request, res: Response) => {
  const event = req.lemonSqueezyEvent!;
  const eventName = event.meta.event_name;

  console.log(`Received LemonSqueezy webhook: ${eventName}`);

  try {
    switch (eventName) {
      case 'subscription_created':
        await handleSubscriptionCreated(event);
        break;

      case 'subscription_updated':
        await handleSubscriptionUpdated(event);
        break;

      case 'subscription_cancelled':
        await handleSubscriptionCancelled(event);
        break;

      case 'subscription_resumed':
        await handleSubscriptionResumed(event);
        break;

      case 'subscription_expired':
        await handleSubscriptionExpired(event);
        break;

      case 'subscription_paused':
        await handleSubscriptionPaused(event);
        break;

      case 'subscription_unpaused':
        await handleSubscriptionUnpaused(event);
        break;

      case 'subscription_payment_success':
        await handlePaymentSuccess(event);
        break;

      case 'subscription_payment_failed':
        await handlePaymentFailed(event);
        break;

      default:
        console.log(`Unhandled event type: ${eventName}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error(`Error handling webhook ${eventName}:`, error);
    // Return 200 to prevent LemonSqueezy from retrying
    res.json({ received: true, error: 'Handler error' });
  }
});

/**
 * Handle subscription created
 */
async function handleSubscriptionCreated(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data, meta } = event;
  const userId = meta.custom_data?.user_id;

  if (!userId) {
    console.error('No user_id in subscription custom_data:', data.id);
    return;
  }

  const attrs = data.attributes;

  // Calculate period dates
  const now = new Date();
  const renewsAt = attrs.renews_at ? new Date(attrs.renews_at) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.subscription.upsert({
    where: { lemonSqueezySubscriptionId: data.id },
    update: {
      status: attrs.status,
      lemonSqueezyVariantId: String(attrs.variant_id),
      currentPeriodStart: now,
      currentPeriodEnd: renewsAt,
      cancelAtPeriodEnd: attrs.cancelled,
      trialEndsAt: attrs.trial_ends_at ? new Date(attrs.trial_ends_at) : null,
    },
    create: {
      userId,
      lemonSqueezyCustomerId: String(attrs.customer_id),
      lemonSqueezySubscriptionId: data.id,
      lemonSqueezyVariantId: String(attrs.variant_id),
      status: attrs.status,
      currentPeriodStart: now,
      currentPeriodEnd: renewsAt,
      cancelAtPeriodEnd: attrs.cancelled,
      trialEndsAt: attrs.trial_ends_at ? new Date(attrs.trial_ends_at) : null,
    },
  });

  console.log(`Subscription ${data.id} created for user ${userId}: ${attrs.status}`);
}

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  const renewsAt = attrs.renews_at ? new Date(attrs.renews_at) : undefined;

  await prisma.subscription.updateMany({
    where: { lemonSqueezySubscriptionId: data.id },
    data: {
      status: attrs.status,
      lemonSqueezyVariantId: String(attrs.variant_id),
      currentPeriodEnd: renewsAt,
      cancelAtPeriodEnd: attrs.cancelled,
      trialEndsAt: attrs.trial_ends_at ? new Date(attrs.trial_ends_at) : null,
    },
  });

  console.log(`Subscription ${data.id} updated: ${attrs.status}`);
}

/**
 * Handle subscription cancelled (set to cancel at period end)
 */
async function handleSubscriptionCancelled(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  await prisma.subscription.updateMany({
    where: { lemonSqueezySubscriptionId: data.id },
    data: {
      status: attrs.status,
      cancelAtPeriodEnd: true,
    },
  });

  console.log(`Subscription ${data.id} cancelled (will end at period end)`);
}

/**
 * Handle subscription resumed
 */
async function handleSubscriptionResumed(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  await prisma.subscription.updateMany({
    where: { lemonSqueezySubscriptionId: data.id },
    data: {
      status: attrs.status,
      cancelAtPeriodEnd: false,
    },
  });

  console.log(`Subscription ${data.id} resumed`);
}

/**
 * Handle subscription expired
 */
async function handleSubscriptionExpired(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;

  await prisma.subscription.updateMany({
    where: { lemonSqueezySubscriptionId: data.id },
    data: {
      status: 'expired',
    },
  });

  console.log(`Subscription ${data.id} expired`);
}

/**
 * Handle subscription paused
 */
async function handleSubscriptionPaused(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;

  await prisma.subscription.updateMany({
    where: { lemonSqueezySubscriptionId: data.id },
    data: {
      status: 'paused',
    },
  });

  console.log(`Subscription ${data.id} paused`);
}

/**
 * Handle subscription unpaused
 */
async function handleSubscriptionUnpaused(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  await prisma.subscription.updateMany({
    where: { lemonSqueezySubscriptionId: data.id },
    data: {
      status: attrs.status,
    },
  });

  console.log(`Subscription ${data.id} unpaused`);
}

/**
 * Handle successful payment
 */
async function handlePaymentSuccess(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  // Update status to active if it was past_due
  await prisma.subscription.updateMany({
    where: {
      lemonSqueezySubscriptionId: data.id,
      status: 'past_due',
    },
    data: {
      status: 'active',
      currentPeriodEnd: attrs.renews_at ? new Date(attrs.renews_at) : undefined,
    },
  });

  console.log(`Payment succeeded for subscription ${data.id}`);
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;

  console.log(`Payment failed for subscription ${data.id}`);

  // Status will be updated via subscription_updated webhook
  // Here you could send an email notification to the user

  // TODO: Implement email notification
  // const subscription = await prisma.subscription.findUnique({
  //   where: { lemonSqueezySubscriptionId: data.id },
  //   include: { user: true },
  // });
  // if (subscription) {
  //   await sendEmail(subscription.user.email, 'payment_failed', {});
  // }
}

export default router;
