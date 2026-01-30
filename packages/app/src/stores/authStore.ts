import { reactive, computed, readonly } from 'vue';
import { authService, type SubscriptionStatus } from '../services/authService';
import { onAuthError, type AuthErrorEvent } from '../services/http';
import { AUTH_ERROR_CODES, isUserSuspended } from '../types/errors';
import { sessionManager } from '../services/sessionManager';
import { configStore } from './configStore';
import type { AuthUser } from '../preload';
import { authLogger } from '../utils/logger';

interface AuthState {
  initialized: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  subscription: SubscriptionStatus | null;
  subscriptionLoading: boolean;
  isLoading: boolean;
  error: string | null;
  isSuspended: boolean;
  suspensionReason: string | null;
  sessionRevoked: boolean;
}

const state = reactive<AuthState>({
  initialized: false,
  isAuthenticated: false,
  user: null,
  subscription: null,
  subscriptionLoading: false,
  isLoading: false,
  error: null,
  isSuspended: false,
  suspensionReason: null,
  sessionRevoked: false,
});

const isActive = computed(() => {
  return state.subscription?.active ?? false;
});

const isTrialing = computed(() => {
  return state.subscription?.isTrialing ?? false;
});

const trialDaysLeft = computed(() => {
  return state.subscription?.trialDaysLeft ?? 0;
});

const subscriptionStatus = computed(() => {
  return state.subscription?.status ?? 'none';
});

const canUseApp = computed(() => {
  // Use sessionManager's canUseApp which considers grace period
  return state.isAuthenticated && sessionManager.canUseApp.value;
});

const needsSubscription = computed(() => {
  if (state.subscriptionLoading) return false;
  // Use sessionManager's canUseApp which considers grace period
  // User needs subscription only if authenticated but sessionManager says can't use app
  return state.isAuthenticated && !sessionManager.canUseApp.value;
});

function handleAuthError(event: AuthErrorEvent): void {
  authLogger.warn('Received auth error event:', event.code);

  if (isUserSuspended(event.code)) {
    handleUserSuspended(event.reason || 'Your account has been suspended');
  } else if (event.code === AUTH_ERROR_CODES.SESSION_REVOKED) {
    handleSessionRevoked();
  } else if (event.code === AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID) {
    handleExpiredToken();
  }
}

let authErrorUnsubscribe: (() => void) | null = null;

async function initialize(): Promise<void> {
  if (state.initialized) {
    authLogger.debug('Already initialized, skipping');
    return;
  }

  state.isLoading = true;
  state.error = null;

  if (!authErrorUnsubscribe) {
    authErrorUnsubscribe = onAuthError(handleAuthError);
  }

  try {
    authLogger.debug('Checking for existing token...');
    const hasToken = await authService.initialize();
    authLogger.debug('Has token:', hasToken);

    if (hasToken) {
      const token = await authService.getAccessToken();
      if (token) {
        await sessionManager.initialize(token, handleSessionExpired);
      }

      authLogger.debug('Verifying token with backend...');
      const verification = await authService.verifyToken();
      authLogger.debug('Token verification result:', { valid: verification.valid, hasUser: !!verification.user });

      if (verification.valid && verification.user) {
        state.isAuthenticated = true;
        state.user = verification.user;
        authLogger.info('User authenticated:', verification.user.email);

        await refreshSubscription();
      } else {
        authLogger.debug('Token invalid or no user returned');
        state.isAuthenticated = false;
        state.user = null;
        state.subscription = null;
      }
    } else {
      authLogger.debug('No token found in Keychain');
      state.isAuthenticated = false;
      state.user = null;
      state.subscription = null;
    }
  } catch (error) {
    authLogger.error('Auth initialization failed:', error);
    state.error = 'Failed to initialize authentication';
    state.isAuthenticated = false;
    state.user = null;
    state.subscription = null;
  } finally {
    state.initialized = true;
    state.isLoading = false;
  }
}

async function signup(email: string, password: string, name?: string): Promise<void> {
  state.isLoading = true;
  state.error = null;

  try {
    const response = await authService.signup(email, password, name);

    // Initialize session manager BEFORE setting isAuthenticated
    // New users won't have a subscription, so sessionManager will set state to 'expired'
    const token = await authService.getAccessToken();
    if (token) {
      await sessionManager.initialize(token, handleSessionExpired);
    }

    state.isAuthenticated = true;
    state.user = response.user;

    state.subscription = { active: false, status: 'none' };
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Signup failed';
    throw error;
  } finally {
    state.isLoading = false;
  }
}

async function login(email: string, password: string): Promise<void> {
  state.isLoading = true;
  state.error = null;

  try {
    const response = await authService.login(email, password);

    // Initialize session manager BEFORE setting isAuthenticated
    // so that canUseApp considers grace period correctly
    const token = await authService.getAccessToken();
    if (token) {
      await sessionManager.initialize(token, handleSessionExpired);
    }

    state.isAuthenticated = true;
    state.user = response.user;

    await refreshSubscription();
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Login failed';
    throw error;
  } finally {
    state.isLoading = false;
  }
}

async function logout(): Promise<void> {
  state.isLoading = true;
  state.error = null;

  try {
    await authService.logout();
    state.isAuthenticated = false;
    state.user = null;
    state.subscription = null;
    state.isSuspended = false;
    state.suspensionReason = null;
    state.sessionRevoked = false;

    // Reset session manager
    await sessionManager.reset();
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Logout failed';
  } finally {
    state.isLoading = false;
  }
}

function handleSessionExpired(): void {
  authLogger.warn('Session expired via SessionManager, forcing logout');

  state.isAuthenticated = false;
  state.user = null;
  state.subscription = null;
  state.isSuspended = false;
  state.suspensionReason = null;
  state.sessionRevoked = false;

  authService.logout().catch(err => authLogger.error('Logout failed:', err));
}

async function handleExpiredToken(): Promise<void> {
  authLogger.warn('Token expired or invalid, forcing logout');

  state.isAuthenticated = false;
  state.user = null;
  state.subscription = null;
  state.isSuspended = false;
  state.suspensionReason = null;
  state.sessionRevoked = false;

  try {
    if (window.electronAPI?.ipc) {
      window.electronAPI.ipc.send('show-notification', {
        title: 'Session Expired',
        body: 'Your session has expired. Please sign in again.',
        silent: configStore.notificationsSilent,
      });
    }
  } catch (error) {
    authLogger.error('Failed to show expiration notification:', error);
  }

  await authService.logout();
}

async function handleUserSuspended(reason: string): Promise<void> {
  authLogger.warn('User suspended:', reason);

  state.isSuspended = true;
  state.suspensionReason = reason;
  state.isAuthenticated = false;
  state.user = null;
  state.subscription = null;

  try {
    if (window.electronAPI?.ipc) {
      window.electronAPI.ipc.send('show-notification', {
        title: 'Account Suspended',
        body: reason || 'Your account has been suspended. Please contact support.',
        silent: configStore.notificationsSilent,
      });
    }
  } catch (error) {
    authLogger.error('Failed to show suspension notification:', error);
  }

  await authService.logout();
}

async function handleSessionRevoked(): Promise<void> {
  authLogger.warn('Session revoked by administrator');

  state.sessionRevoked = true;
  state.isAuthenticated = false;
  state.user = null;
  state.subscription = null;

  try {
    if (window.electronAPI?.ipc) {
      window.electronAPI.ipc.send('show-notification', {
        title: 'Session Terminated',
        body: 'Your session has been terminated. Please sign in again.',
        silent: configStore.notificationsSilent,
      });
    }
  } catch (error) {
    authLogger.error('Failed to show session revoked notification:', error);
  }

  await authService.logout();
}

function clearSuspension(): void {
  state.isSuspended = false;
  state.suspensionReason = null;
}

function clearSessionRevoked(): void {
  state.sessionRevoked = false;
}

async function refreshSubscription(): Promise<void> {
  if (!state.isAuthenticated) return;

  state.subscriptionLoading = true;
  try {
    state.subscription = await authService.getSubscriptionStatus();
    await sessionManager.forceSyncNow();
  } catch (error) {
    authLogger.error('Failed to refresh subscription:', error);
    state.subscription = { active: false, status: 'error', message: 'Failed to check subscription' };
  } finally {
    state.subscriptionLoading = false;
  }
}

async function openCheckout(priceId: 'monthly' | 'yearly'): Promise<void> {
  state.isLoading = true;
  state.error = null;

  try {
    const checkout = await authService.createCheckoutSession(priceId);
    if (checkout.url) {
      window.electronAPI.shell.openExternal(checkout.url);
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Failed to open checkout';
    throw error;
  } finally {
    state.isLoading = false;
  }
}

async function openCustomerPortal(): Promise<void> {
  state.isLoading = true;
  state.error = null;

  try {
    const portal = await authService.openCustomerPortal();
    if (portal.url) {
      window.electronAPI.shell.openExternal(portal.url);
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Failed to open customer portal';
    throw error;
  } finally {
    state.isLoading = false;
  }
}

function clearError(): void {
  state.error = null;
}

export const authStore = {
  state: readonly(state),

  isActive,
  isTrialing,
  trialDaysLeft,
  subscriptionStatus,
  canUseApp,
  needsSubscription,

  initialize,
  signup,
  login,
  logout,
  refreshSubscription,
  openCheckout,
  openCustomerPortal,
  clearError,
  handleExpiredToken,
  handleUserSuspended,
  handleSessionRevoked,
  clearSuspension,
  clearSessionRevoked,
};
