import { UserRole, Subscription } from '@prisma/client';

export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'on_trial'] as const;

/**
 * Verifies if a subscription has expired based on currentPeriodEnd date.
 * Accounts for webhook delays or sync issues.
 */
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

/**
 * Verifies if a user has an active subscription OR is a SUPERUSER.
 * SUPERUSER bypasses the subscription requirement.
 * Includes date-based expiry check for robustness against webhook delays.
 */
export function hasActiveSubscriptionOrIsSuperuser(
  role: UserRole,
  subscription: Subscription | null | undefined
): boolean {
  if (role === UserRole.SUPERUSER) {
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

/**
 * Checks only if the subscription is active (does NOT bypass for SUPERUSER).
 * Includes date-based expiry check for robustness against webhook delays.
 */
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
