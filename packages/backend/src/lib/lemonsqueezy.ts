const LEMONSQUEEZY_API_URL = 'https://api.lemonsqueezy.com/v1';

if (!process.env.LEMONSQUEEZY_API_KEY) {
  console.warn('Warning: LEMONSQUEEZY_API_KEY environment variable is not set');
}

export const LEMONSQUEEZY_CONFIG = {
  STORE_ID: process.env.LEMONSQUEEZY_STORE_ID || '',
  VARIANT_MONTHLY: process.env.LEMONSQUEEZY_VARIANT_MONTHLY || '',
  VARIANT_YEARLY: process.env.LEMONSQUEEZY_VARIANT_YEARLY || '',
  WEBHOOK_SECRET: process.env.LEMONSQUEEZY_WEBHOOK_SECRET || '',
};

export const TRIAL_PERIOD_DAYS = 14;

export interface LemonSqueezyResponse<T> {
  data: T;
  meta?: {
    page?: {
      currentPage: number;
      lastPage: number;
    };
  };
}

export interface LemonSqueezyCheckout {
  id: string;
  type: 'checkouts';
  attributes: {
    url: string;
    store_id: number;
    variant_id: number;
    custom_price: number | null;
    product_options: Record<string, unknown>;
    checkout_options: Record<string, unknown>;
    checkout_data: Record<string, unknown>;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
  };
}

interface LemonSqueezySubscription {
  id: string;
  type: 'subscriptions';
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
    urls: {
      update_payment_method: string;
      customer_portal: string;
    };
  };
}

export async function lemonSqueezyFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;

  if (!apiKey) {
    throw new Error('LEMONSQUEEZY_API_KEY is not configured');
  }

  const response = await fetch(`${LEMONSQUEEZY_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('LemonSqueezy API error:', response.status, error);
    throw new Error(`LemonSqueezy API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function createCheckout(
  variantId: string,
  email: string,
  userId: string,
  customData?: Record<string, string>
): Promise<{ url: string; checkoutId: string }> {
  const response = await lemonSqueezyFetch<LemonSqueezyResponse<LemonSqueezyCheckout>>(
    '/checkouts',
    {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              email,
              custom: {
                user_id: userId,
                ...customData,
              },
            },
            checkout_options: {
              embed: false,
              media: true,
              button_color: '#0ea5e9',
            },
            product_options: {
              enabled_variants: [parseInt(variantId)],
              redirect_url: `${process.env.FRONTEND_URL || 'https://prmanagerhub.com'}/success`,
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

  return {
    url: response.data.attributes.url,
    checkoutId: response.data.id,
  };
}

export async function getSubscription(
  subscriptionId: string
): Promise<LemonSqueezySubscription> {
  const response = await lemonSqueezyFetch<LemonSqueezyResponse<LemonSqueezySubscription>>(
    `/subscriptions/${subscriptionId}`
  );
  return response.data;
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await lemonSqueezyFetch(`/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
  });
}

export async function resumeSubscription(subscriptionId: string): Promise<void> {
  await lemonSqueezyFetch(`/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        type: 'subscriptions',
        id: subscriptionId,
        attributes: {
          cancelled: false,
        },
      },
    }),
  });
}

export async function getCustomerPortalUrl(subscriptionId: string): Promise<string> {
  const subscription = await getSubscription(subscriptionId);
  return subscription.attributes.urls.customer_portal;
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');

  const signatureBuffer = Buffer.from(signature);
  const digestBuffer = Buffer.from(digest);

  if (signatureBuffer.length !== digestBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
}

export type { LemonSqueezySubscription };
