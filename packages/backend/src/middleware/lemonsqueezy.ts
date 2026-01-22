import { Request, Response, NextFunction } from 'express';
import { verifyWebhookSignature, LEMONSQUEEZY_CONFIG } from '../lib/lemonsqueezy.js';

/**
 * LemonSqueezy Webhook Event interface
 */
export interface LemonSqueezyWebhookEvent {
  meta: {
    event_name: string;
    custom_data?: {
      user_id?: string;
      plan?: string;
    };
  };
  data: {
    id: string;
    type: string;
    attributes: {
      store_id: number;
      customer_id: number;
      order_id: number;
      product_id: number;
      variant_id: number;
      product_name: string;
      variant_name: string;
      user_name: string;
      user_email: string;
      status: 'on_trial' | 'active' | 'paused' | 'past_due' | 'unpaid' | 'cancelled' | 'expired';
      status_formatted: string;
      card_brand: string | null;
      card_last_four: string | null;
      pause: unknown | null;
      cancelled: boolean;
      trial_ends_at: string | null;
      billing_anchor: number;
      renews_at: string | null;
      ends_at: string | null;
      created_at: string;
      updated_at: string;
      first_subscription_item?: {
        id: number;
        subscription_id: number;
        price_id: number;
        quantity: number;
        created_at: string;
        updated_at: string;
      };
      urls: {
        update_payment_method: string;
        customer_portal: string;
      };
    };
  };
}

declare global {
  namespace Express {
    interface Request {
      lemonSqueezyEvent?: LemonSqueezyWebhookEvent;
    }
  }
}

/**
 * Middleware to verify LemonSqueezy webhook signature
 */
export function verifyLemonSqueezyWebhook(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['x-signature'] as string;

  if (!signature) {
    res.status(400).json({ error: 'Missing x-signature header' });
    return;
  }

  if (!LEMONSQUEEZY_CONFIG.WEBHOOK_SECRET) {
    console.error('LEMONSQUEEZY_WEBHOOK_SECRET not configured');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    // req.body should be the raw string for webhook verification
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    const isValid = verifyWebhookSignature(
      rawBody,
      signature,
      LEMONSQUEEZY_CONFIG.WEBHOOK_SECRET
    );

    if (!isValid) {
      console.error('Webhook signature verification failed');
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }

    // Parse the body if it's a string
    const event: LemonSqueezyWebhookEvent = typeof req.body === 'string'
      ? JSON.parse(req.body)
      : req.body;

    req.lemonSqueezyEvent = event;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook verification error:', message);
    res.status(400).json({ error: `Webhook Error: ${message}` });
  }
}
