import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { verifyLemonSqueezyWebhook, LemonSqueezyWebhookEvent } from '../middleware/lemonsqueezy.js';
import { authenticate } from '../middleware/auth.js';
import {
  logWebhookEvent,
  markWebhookProcessed,
  logWebhookError,
  getWebhookEvent,
} from '../services/webhookAudit.js';
import { sendEmail } from '../services/emailService.js';
import { paymentFailedTemplate } from '../templates/emails.js';

const router = Router();

export async function processWebhookByName(
  eventName: string,
  eventData: Record<string, unknown>
): Promise<void> {
  const event = {
    data: eventData,
    meta: (eventData as any).meta || { custom_data: {} },
  } as LemonSqueezyWebhookEvent;

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
      console.log(`[Webhook] Unhandled event type: ${eventName}`);
  }
}

router.post('/lemonsqueezy', verifyLemonSqueezyWebhook, async (req: Request, res: Response) => {
  const event = req.lemonSqueezyEvent!;
  const eventName = event.meta.event_name;
  const eventId = event.data.id;

  console.log(`[Webhook] Received: ${eventName} (${eventId})`);

  let webhookEventId = '';

  try {
    webhookEventId = await logWebhookEvent(eventId, eventName, event.data);

    const existingEvent = await getWebhookEvent(webhookEventId);
    if (existingEvent?.processed === true) {
      console.log(`[Webhook] Event already processed (idempotent), skipping: ${eventId}`);
      res.json({ received: true, eventId: webhookEventId, cached: true });
      return;
    }

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
        console.log(`[Webhook] Unhandled event type: ${eventName}`);
    }

    await markWebhookProcessed(webhookEventId);

    res.json({ received: true, eventId: webhookEventId });
  } catch (error) {
    console.error(`[Webhook] Error handling ${eventName}:`, error);

    if (webhookEventId) {
      await logWebhookError(webhookEventId, error as Error, true);
    }

    res.json({
      received: true,
      eventId: webhookEventId,
      warning: 'Processing failed but logged for retry',
    });
  }
});

async function handleSubscriptionCreated(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data, meta } = event;
  const userId = meta.custom_data?.user_id;

  if (!userId) {
    console.error('No user_id in subscription custom_data:', data.id);
    throw new Error('Missing user_id in webhook data');
  }

  const attrs = data.attributes;

  const now = new Date();
  const renewsAt = attrs.renews_at ? new Date(attrs.renews_at) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.subscription.upsert({
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
  });

  console.log(`[Webhook] Subscription ${data.id} created for user ${userId}: ${attrs.status}`);
}

async function handleSubscriptionUpdated(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  const renewsAt = attrs.renews_at ? new Date(attrs.renews_at) : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { lemonSqueezySubscriptionId: data.id },
      data: {
        status: attrs.status,
        lemonSqueezyVariantId: String(attrs.variant_id),
        currentPeriodEnd: renewsAt,
        cancelAtPeriodEnd: attrs.cancelled,
        trialEndsAt: attrs.trial_ends_at ? new Date(attrs.trial_ends_at) : null,
      },
    });
  });

  console.log(`[Webhook] Subscription ${data.id} updated: ${attrs.status}`);
}

async function handleSubscriptionCancelled(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { lemonSqueezySubscriptionId: data.id },
      data: {
        status: attrs.status,
        cancelAtPeriodEnd: true,
      },
    });
  });

  console.log(`[Webhook] Subscription ${data.id} cancelled (will end at period end)`);
}

async function handleSubscriptionResumed(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { lemonSqueezySubscriptionId: data.id },
      data: {
        status: attrs.status,
        cancelAtPeriodEnd: false,
      },
    });
  });

  console.log(`[Webhook] Subscription ${data.id} resumed`);
}

async function handleSubscriptionExpired(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;

  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { lemonSqueezySubscriptionId: data.id },
      data: {
        status: 'expired',
      },
    });
  });

  console.log(`[Webhook] Subscription ${data.id} expired`);
}

async function handleSubscriptionPaused(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;

  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { lemonSqueezySubscriptionId: data.id },
      data: {
        status: 'paused',
      },
    });
  });

  console.log(`[Webhook] Subscription ${data.id} paused`);
}

async function handleSubscriptionUnpaused(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { lemonSqueezySubscriptionId: data.id },
      data: {
        status: attrs.status,
      },
    });
  });

  console.log(`[Webhook] Subscription ${data.id} unpaused`);
}

async function handlePaymentSuccess(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: {
        lemonSqueezySubscriptionId: data.id,
        status: 'past_due',
      },
      data: {
        status: 'active',
        currentPeriodEnd: attrs.renews_at ? new Date(attrs.renews_at) : undefined,
      },
    });
  });

  console.log(`[Webhook] Payment succeeded for subscription ${data.id}`);
}

async function handlePaymentFailed(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { lemonSqueezySubscriptionId: data.id },
      data: {
        status: attrs.status,
      },
    });
  });

  console.log(`[Webhook] Payment failed for subscription ${data.id}, status: ${attrs.status}`);

  try {
    const subscription = await prisma.subscription.findUnique({
      where: { lemonSqueezySubscriptionId: data.id },
      include: { user: { select: { email: true, name: true } } },
    });

    if (subscription?.user) {
      const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'https://prmanagerhub.com';
      const billingUrl = `${appUrl}/settings/billing`;
      await sendEmail({
        to: subscription.user.email,
        subject: 'Action Required: Payment Failed - PR Manager',
        html: paymentFailedTemplate(
          subscription.user.name || 'there',
          billingUrl
        ),
      });
      console.log(`[Webhook] Payment failure email sent to ${subscription.user.email}`);
    }
  } catch (emailError) {
    console.error('[Webhook] Failed to send payment failure email:', emailError);
  }
}

function getQueryString(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function getQueryNumber(value: string | string[] | undefined, defaultValue: number): number {
  const str = getQueryString(value);
  if (!str) return defaultValue;
  const num = parseInt(str, 10);
  return isNaN(num) ? defaultValue : num;
}

router.get('/audit/events', authenticate, async (req: Request, res: Response) => {
  try {
    const skip = getQueryNumber(req.query.skip as any, 0);
    const take = Math.min(getQueryNumber(req.query.take as any, 100), 100);
    const processedParam = getQueryString(req.query.processed as any);

    const where: any = {};
    if (processedParam === 'true') where.processed = true;
    if (processedParam === 'false') where.processed = false;

    const events = await prisma.webhookEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    res.json(events);
  } catch (error) {
    console.error('[Webhook] Error fetching audit events:', error);
    res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});

router.get('/audit/events/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const event = await prisma.webhookEvent.findUnique({
      where: { id },
      include: { queueItem: true },
    });

    if (!event) {
      res.status(404).json({ error: 'Webhook event not found' });
      return;
    }

    res.json(event);
  } catch (error) {
    console.error('[Webhook] Error fetching event details:', error);
    res.status(500).json({ error: 'Failed to fetch event details' });
  }
});

router.post('/audit/events/:id/replay', authenticate, async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const event = await prisma.webhookEvent.findUnique({
      where: { id },
    });

    if (!event) {
      res.status(404).json({ error: 'Webhook event not found' });
      return;
    }

    await prisma.webhookEvent.update({
      where: { id },
      data: {
        processed: false,
        error: null,
        errorCount: 0,
      },
    });

    res.json({ message: 'Webhook queued for replay', eventId: id });
  } catch (error) {
    console.error('[Webhook] Error replaying event:', error);
    res.status(500).json({ error: 'Failed to replay event' });
  }
});

export default router;
