import { UserRole, Subscription } from '@prisma/client';

export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'on_trial'] as const;

function isSubscriptionExpiredByDate(subscription: Subscription): boolean {
  if (subscription.currentPeriodEnd && subscription.currentPeriodEnd < new Date()) {
    return true;
  }

  if (
    subscription.status === 'on_trial' &&
    subscription.trialEndsAt &&
    subscription.trialEndsAt < new Date()
  ) {
    return true;
  }

  return false;
}

export function hasActiveSubscriptionOrIsSuperuser(
  role: UserRole,
  subscription: Subscription | null | undefined
): boolean {
  if (role === UserRole.SUPERUSER || role === UserRole.LIFETIME || role === UserRole.BETA) {
    return true;
  }

  if (!subscription) {
    return false;
  }

  if (!ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status as any)) {
    return false;
  }

  if (isSubscriptionExpiredByDate(subscription)) {
    return false;
  }

  return true;
}

export function hasActiveSubscription(
  subscription: Subscription | null | undefined
): boolean {
  if (!subscription) {
    return false;
  }

  if (!ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status as any)) {
    return false;
  }

  if (isSubscriptionExpiredByDate(subscription)) {
    return false;
  }

  return true;
}

export function isSuperuser(role: UserRole): boolean {
  return role === UserRole.SUPERUSER;
}

export function isAdmin(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPERUSER;
}

export function hasLifetimeAccess(role: UserRole): boolean {
  return role === UserRole.LIFETIME;
}

export function hasFreeAccess(role: UserRole): boolean {
  return role === UserRole.SUPERUSER || role === UserRole.LIFETIME || role === UserRole.BETA;
}

export function hasBetaAccess(role: UserRole): boolean {
  return role === UserRole.BETA;
}
