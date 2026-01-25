import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../../src/app.js';
import { prisma } from '../../../src/lib/prisma.js';
import { createTestUser } from '../../helpers/testHelpers.js';

// Set webhook secret for tests
const TEST_WEBHOOK_SECRET = 'test-webhook-secret-for-testing';
process.env.LEMONSQUEEZY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

/**
 * Generate a valid HMAC signature for webhook testing
 */
function generateWebhookSignature(payload: string): string {
  return crypto
    .createHmac('sha256', TEST_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
}

/**
 * Create a mock LemonSqueezy webhook event
 */
function createWebhookEvent(
  eventName: string,
  userId: string,
  subscriptionId = 'sub_123456',
  overrides: Record<string, any> = {}
) {
  return {
    meta: {
      event_name: eventName,
      custom_data: {
        user_id: userId,
      },
    },
    data: {
      id: subscriptionId,
      type: 'subscriptions',
      attributes: {
        store_id: 12345,
        customer_id: 67890,
        order_id: 11111,
        product_id: 22222,
        variant_id: 33333,
        product_name: 'PR Manager Pro',
        variant_name: 'Monthly',
        user_name: 'Test User',
        user_email: 'test@example.com',
        status: 'active',
        status_formatted: 'Active',
        card_brand: 'visa',
        card_last_four: '4242',
        pause: null,
        cancelled: false,
        trial_ends_at: null,
        billing_anchor: 1,
        renews_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        ends_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        urls: {
          update_payment_method: 'https://example.com/update',
          customer_portal: 'https://example.com/portal',
        },
        ...overrides,
      },
    },
  };
}

describe('Webhook Routes', () => {
  const app = createApp();

  describe('POST /webhooks/lemonsqueezy', () => {
    it('should reject request without signature', async () => {
      const res = await request(app)
        .post('/webhooks/lemonsqueezy')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing x-signature header');
    });

    it('should reject request with invalid signature', async () => {
      const payload = JSON.stringify({ test: 'data' });

      const res = await request(app)
        .post('/webhooks/lemonsqueezy')
        .set('Content-Type', 'application/json')
        .set('x-signature', 'invalid-signature')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid signature');
    });

    it('should process subscription_created event', async () => {
      const user = await createTestUser({ email: 'webhook-sub@test.com' });
      const event = createWebhookEvent('subscription_created', user.id, 'sub_created_123');
      const payload = JSON.stringify(event);
      const signature = generateWebhookSignature(payload);

      const res = await request(app)
        .post('/webhooks/lemonsqueezy')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('received', true);
      expect(res.body).toHaveProperty('eventId');

      // Verify subscription was created
      const subscription = await prisma.subscription.findFirst({
        where: { lemonSqueezySubscriptionId: 'sub_created_123' },
      });
      expect(subscription).not.toBeNull();
      expect(subscription?.userId).toBe(user.id);
      expect(subscription?.status).toBe('active');
    });

    it('should process subscription_updated event', async () => {
      const user = await createTestUser({ email: 'webhook-update@test.com' });

      // First create a subscription
      await prisma.subscription.create({
        data: {
          userId: user.id,
          lemonSqueezyCustomerId: '67890',
          lemonSqueezySubscriptionId: 'sub_update_123',
          lemonSqueezyVariantId: '33333',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Send update event
      const event = createWebhookEvent('subscription_updated', user.id, 'sub_update_123', {
        status: 'past_due',
      });
      const payload = JSON.stringify(event);
      const signature = generateWebhookSignature(payload);

      const res = await request(app)
        .post('/webhooks/lemonsqueezy')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature)
        .send(payload);

      expect(res.status).toBe(200);

      // Verify subscription was updated
      const subscription = await prisma.subscription.findFirst({
        where: { lemonSqueezySubscriptionId: 'sub_update_123' },
      });
      expect(subscription?.status).toBe('past_due');
    });

    it('should process subscription_cancelled event', async () => {
      const user = await createTestUser({ email: 'webhook-cancel@test.com' });

      // First create a subscription
      await prisma.subscription.create({
        data: {
          userId: user.id,
          lemonSqueezyCustomerId: '67890',
          lemonSqueezySubscriptionId: 'sub_cancel_123',
          lemonSqueezyVariantId: '33333',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Send cancellation event
      const event = createWebhookEvent('subscription_cancelled', user.id, 'sub_cancel_123', {
        status: 'cancelled',
        cancelled: true,
      });
      const payload = JSON.stringify(event);
      const signature = generateWebhookSignature(payload);

      const res = await request(app)
        .post('/webhooks/lemonsqueezy')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature)
        .send(payload);

      expect(res.status).toBe(200);

      // Verify subscription was cancelled
      const subscription = await prisma.subscription.findFirst({
        where: { lemonSqueezySubscriptionId: 'sub_cancel_123' },
      });
      expect(subscription?.status).toBe('cancelled');
      expect(subscription?.cancelAtPeriodEnd).toBe(true);
    });

    it('should handle idempotency (same event twice)', async () => {
      const user = await createTestUser({ email: 'webhook-idem@test.com' });
      const event = createWebhookEvent('subscription_created', user.id, 'sub_idem_123');
      const payload = JSON.stringify(event);
      const signature = generateWebhookSignature(payload);

      // Send first time
      const res1 = await request(app)
        .post('/webhooks/lemonsqueezy')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature)
        .send(payload);

      expect(res1.status).toBe(200);
      const eventId = res1.body.eventId;

      // Send second time (same event)
      const res2 = await request(app)
        .post('/webhooks/lemonsqueezy')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature)
        .send(payload);

      expect(res2.status).toBe(200);
      expect(res2.body).toHaveProperty('cached', true);

      // Should only have one subscription
      const subscriptions = await prisma.subscription.findMany({
        where: { lemonSqueezySubscriptionId: 'sub_idem_123' },
      });
      expect(subscriptions.length).toBe(1);
    });

    it('should log webhook event to audit trail', async () => {
      const user = await createTestUser({ email: 'webhook-audit@test.com' });
      const event = createWebhookEvent('subscription_created', user.id, 'sub_audit_123');
      const payload = JSON.stringify(event);
      const signature = generateWebhookSignature(payload);

      const res = await request(app)
        .post('/webhooks/lemonsqueezy')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature)
        .send(payload);

      expect(res.status).toBe(200);

      // Verify webhook event was logged
      const webhookEvent = await prisma.webhookEvent.findFirst({
        where: { eventId: 'sub_audit_123' },
      });
      expect(webhookEvent).not.toBeNull();
      expect(webhookEvent?.eventName).toBe('subscription_created');
      expect(webhookEvent?.processed).toBe(true);
    });

    it('should handle subscription without user_id gracefully', async () => {
      const event = {
        meta: {
          event_name: 'subscription_created',
          custom_data: {}, // No user_id
        },
        data: {
          id: 'sub_no_user',
          type: 'subscriptions',
          attributes: {
            store_id: 12345,
            customer_id: 67890,
            variant_id: 33333,
            status: 'active',
            cancelled: false,
            renews_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
        },
      };
      const payload = JSON.stringify(event);
      const signature = generateWebhookSignature(payload);

      const res = await request(app)
        .post('/webhooks/lemonsqueezy')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature)
        .send(payload);

      // Should still return 200 (LemonSqueezy requirement)
      // Error is logged but not thrown
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('received', true);
    });

    it('should process subscription_expired event', async () => {
      const user = await createTestUser({ email: 'webhook-expire@test.com' });

      // First create a subscription
      await prisma.subscription.create({
        data: {
          userId: user.id,
          lemonSqueezyCustomerId: '67890',
          lemonSqueezySubscriptionId: 'sub_expire_123',
          lemonSqueezyVariantId: '33333',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Send expiration event
      const event = createWebhookEvent('subscription_expired', user.id, 'sub_expire_123', {
        status: 'expired',
      });
      const payload = JSON.stringify(event);
      const signature = generateWebhookSignature(payload);

      const res = await request(app)
        .post('/webhooks/lemonsqueezy')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature)
        .send(payload);

      expect(res.status).toBe(200);

      // Verify subscription was expired
      const subscription = await prisma.subscription.findFirst({
        where: { lemonSqueezySubscriptionId: 'sub_expire_123' },
      });
      expect(subscription?.status).toBe('expired');
    });

    it('should process subscription_payment_failed event', async () => {
      const user = await createTestUser({ email: 'webhook-fail@test.com' });

      // First create a subscription
      await prisma.subscription.create({
        data: {
          userId: user.id,
          lemonSqueezyCustomerId: '67890',
          lemonSqueezySubscriptionId: 'sub_fail_123',
          lemonSqueezyVariantId: '33333',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Send payment failed event
      const event = createWebhookEvent('subscription_payment_failed', user.id, 'sub_fail_123', {
        status: 'past_due',
      });
      const payload = JSON.stringify(event);
      const signature = generateWebhookSignature(payload);

      const res = await request(app)
        .post('/webhooks/lemonsqueezy')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature)
        .send(payload);

      expect(res.status).toBe(200);

      // Verify subscription status was updated
      const subscription = await prisma.subscription.findFirst({
        where: { lemonSqueezySubscriptionId: 'sub_fail_123' },
      });
      expect(subscription?.status).toBe('past_due');
    });

    it('should handle unrecognized event types gracefully', async () => {
      const user = await createTestUser({ email: 'webhook-unknown@test.com' });
      const event = createWebhookEvent('unknown_event_type', user.id, 'sub_unknown_123');
      const payload = JSON.stringify(event);
      const signature = generateWebhookSignature(payload);

      const res = await request(app)
        .post('/webhooks/lemonsqueezy')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature)
        .send(payload);

      // Should still acknowledge receipt
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('received', true);
    });

    it('should process subscription with trial period', async () => {
      const user = await createTestUser({ email: 'webhook-trial@test.com' });
      const trialEndDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const event = createWebhookEvent('subscription_created', user.id, 'sub_trial_123', {
        status: 'on_trial',
        trial_ends_at: trialEndDate,
      });
      const payload = JSON.stringify(event);
      const signature = generateWebhookSignature(payload);

      const res = await request(app)
        .post('/webhooks/lemonsqueezy')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature)
        .send(payload);

      expect(res.status).toBe(200);

      // Verify subscription has trial
      const subscription = await prisma.subscription.findFirst({
        where: { lemonSqueezySubscriptionId: 'sub_trial_123' },
      });
      expect(subscription?.status).toBe('on_trial');
      expect(subscription?.trialEndsAt).not.toBeNull();
    });
  });
});
