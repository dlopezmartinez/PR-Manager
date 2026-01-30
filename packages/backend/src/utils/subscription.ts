import { prisma } from '../lib/prisma.js';
import { ApiError, ErrorCodes } from '../lib/errors.js';
import { hasActiveSubscriptionOrIsSuperuser } from '../lib/authorization.js';

export async function requireActiveSubscription(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscription: true,
    },
  });

  if (!user) {
    throw new ApiError({
      code: ErrorCodes.USER_NOT_FOUND,
    });
  }

  const hasAccess = hasActiveSubscriptionOrIsSuperuser(user.role, user.subscription);

  if (!hasAccess) {
    throw new ApiError({
      code: ErrorCodes.SUBSCRIPTION_REQUIRED,
    });
  }
}

export async function getSubscriptionStatus(userId: string): Promise<{
  active: boolean;
  status: string;
  hasPrivilegedAccess: boolean;
  subscription: {
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
    trialEndsAt?: Date | null;
  } | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscription: true,
    },
  });

  if (!user) {
    return {
      active: false,
      status: 'none',
      hasPrivilegedAccess: false,
      subscription: null,
    };
  }

  const hasPrivilegedAccess = ['SUPERUSER', 'LIFETIME', 'BETA'].includes(user.role);
  const hasAccess = hasActiveSubscriptionOrIsSuperuser(user.role, user.subscription);

  return {
    active: hasAccess,
    status: user.subscription?.status || (hasPrivilegedAccess ? user.role.toLowerCase() : 'none'),
    hasPrivilegedAccess,
    subscription: user.subscription
      ? {
          currentPeriodEnd: user.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
          trialEndsAt: user.subscription.trialEndsAt,
        }
      : null,
  };
}
