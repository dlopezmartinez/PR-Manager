import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { JWTPayload, SubscriptionClaims } from '../interfaces/auth.js';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

export function generateAccessToken(payload: {
  userId: string;
  email: string;
  role: UserRole;
  subscription?: SubscriptionClaims;
}): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: '7d',
  });
}

export function verifyAccessToken(token: string): JWTPayload {
  return jwt.verify(token, getJwtSecret()) as JWTPayload;
}

export async function getSubscriptionClaims(userId: string): Promise<SubscriptionClaims> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user?.role === 'LIFETIME' || user?.role === 'SUPERUSER' || user?.role === 'BETA') {
    return {
      active: true,
      status: 'active',
      plan: user.role === 'BETA' ? 'beta' : 'lifetime',
      expiresAt: null,
    };
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription) {
    return {
      active: false,
      status: 'none',
      plan: null,
      expiresAt: null,
    };
  }

  let status: SubscriptionClaims['status'];
  switch (subscription.status) {
    case 'active':
      status = 'active';
      break;
    case 'trialing':
      status = 'on_trial';
      break;
    case 'past_due':
      status = 'past_due';
      break;
    case 'canceled':
      status = 'cancelled';
      break;
    default:
      status = 'expired';
  }

  const isActive = ['active', 'trialing'].includes(subscription.status) &&
    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > new Date());

  let plan: SubscriptionClaims['plan'] = null;
  const variantId = subscription.lemonSqueezyVariantId;
  const monthlyVariantId = process.env.LEMONSQUEEZY_VARIANT_MONTHLY;
  const yearlyVariantId = process.env.LEMONSQUEEZY_VARIANT_YEARLY;

  if (variantId && yearlyVariantId && variantId === yearlyVariantId) {
    plan = 'yearly';
  } else if (variantId && monthlyVariantId && variantId === monthlyVariantId) {
    plan = 'monthly';
  }

  return {
    active: isActive,
    status,
    plan,
    expiresAt: subscription.currentPeriodEnd
      ? Math.floor(subscription.currentPeriodEnd.getTime() / 1000)
      : null,
  };
}

export function generateToken(payload: {
  userId: string;
  email: string;
  role: UserRole;
}): string {
  return generateAccessToken(payload);
}
