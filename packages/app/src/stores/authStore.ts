/**
 * Authentication Store
 * Reactive state management for auth and subscription status
 * Handles:
 * - User authentication state
 * - Subscription status
 * - User suspension detection
 * - Session revocation handling
 */

import { reactive, computed, readonly } from 'vue';
import { authService, type SubscriptionStatus } from '../services/authService';
import { onAuthError, type AuthErrorEvent } from '../services/http';
import { AUTH_ERROR_CODES, isUserSuspended } from '../types/errors';
import type { AuthUser } from '../preload';

// Check if auth should be skipped (for development/beta testing)
const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true';

interface AuthState {
  initialized: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  subscription: SubscriptionStatus | null;
  isLoading: boolean;
  error: string | null;
  // Suspension state
  isSuspended: boolean;
  suspensionReason: string | null;
  // Session state
  sessionRevoked: boolean;
}

const state = reactive<AuthState>({
  initialized: false,
  isAuthenticated: false,
  user: null,
  subscription: null,
  isLoading: false,
  error: null,
  isSuspended: false,
  suspensionReason: null,
  sessionRevoked: false,
});

// Computed properties
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
  // User can use the app if they have an active subscription or are in trial
  return state.isAuthenticated && (state.subscription?.active ?? false);
});

const needsSubscription = computed(() => {
  // User is authenticated but doesn't have an active subscription
  return state.isAuthenticated && !state.subscription?.active;
});

/**
 * Handle auth error events from HTTP interceptor
 * Centralizes handling of suspension and session revocation
 */
function handleAuthError(event: AuthErrorEvent): void {
  console.warn('[Auth] Received auth error event:', event.code);

  if (isUserSuspended(event.code)) {
    handleUserSuspended(event.reason || 'Your account has been suspended');
  } else if (event.code === AUTH_ERROR_CODES.SESSION_REVOKED) {
    handleSessionRevoked();
  } else if (event.code === AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID) {
    handleExpiredToken();
  }
}

// Subscribe to auth error events from HTTP interceptor
let authErrorUnsubscribe: (() => void) | null = null;

/**
 * Initialize the auth store
 * Should be called once on app startup
 */
async function initialize(): Promise<void> {
  if (state.initialized) return;

  state.isLoading = true;
  state.error = null;

  // Subscribe to auth error events (only once)
  if (!authErrorUnsubscribe) {
    authErrorUnsubscribe = onAuthError(handleAuthError);
  }

  // Skip auth for development/beta testing
  if (SKIP_AUTH) {
    console.log('[Auth] Skipping authentication (VITE_SKIP_AUTH=true)');
    state.isAuthenticated = true;
    state.user = { id: 'dev-user', email: 'dev@prmanager.app', name: 'Developer' };
    state.subscription = { active: true, status: 'active', isTrialing: false };
    state.initialized = true;
    state.isLoading = false;
    return;
  }

  try {
    // Initialize auth service (loads stored token)
    const hasToken = await authService.initialize();

    if (hasToken) {
      // Verify the token is still valid
      const verification = await authService.verifyToken();

      if (verification.valid && verification.user) {
        state.isAuthenticated = true;
        state.user = verification.user;

        // Check subscription status
        await refreshSubscription();
      } else {
        state.isAuthenticated = false;
        state.user = null;
        state.subscription = null;
      }
    } else {
      state.isAuthenticated = false;
      state.user = null;
      state.subscription = null;
    }
  } catch (error) {
    console.error('Auth initialization failed:', error);
    state.error = 'Failed to initialize authentication';
    state.isAuthenticated = false;
    state.user = null;
    state.subscription = null;
  } finally {
    state.initialized = true;
    state.isLoading = false;
  }
}

/**
 * Sign up a new user
 */
async function signup(email: string, password: string, name?: string): Promise<void> {
  state.isLoading = true;
  state.error = null;

  try {
    const response = await authService.signup(email, password, name);
    state.isAuthenticated = true;
    state.user = response.user;

    // New users start with no subscription (will get trial on first checkout)
    state.subscription = { active: false, status: 'none' };
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Signup failed';
    throw error;
  } finally {
    state.isLoading = false;
  }
}

/**
 * Log in an existing user
 */
async function login(email: string, password: string): Promise<void> {
  state.isLoading = true;
  state.error = null;

  try {
    const response = await authService.login(email, password);
    state.isAuthenticated = true;
    state.user = response.user;

    // Check subscription status
    await refreshSubscription();
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Login failed';
    throw error;
  } finally {
    state.isLoading = false;
  }
}

/**
 * Log out the current user
 */
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
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Logout failed';
  } finally {
    state.isLoading = false;
  }
}

/**
 * Handle expired/invalid token
 * Called by health polling when token is no longer valid
 */
async function handleExpiredToken(): Promise<void> {
  console.warn('[Auth] Token expired or invalid, forcing logout');

  // Clear auth data
  state.isAuthenticated = false;
  state.user = null;
  state.subscription = null;
  state.isSuspended = false;
  state.suspensionReason = null;
  state.sessionRevoked = false;

  // Show native notification to user
  try {
    if (window.electronAPI?.ipc) {
      window.electronAPI.ipc.send('show-notification', {
        title: 'Session Expired',
        body: 'Your session has expired. Please sign in again.',
      });
    }
  } catch (error) {
    console.error('Failed to show expiration notification:', error);
  }

  // Clear tokens from storage
  await authService.logout();
}

/**
 * Handle user suspension
 * Called when backend returns USER_SUSPENDED error
 */
async function handleUserSuspended(reason: string): Promise<void> {
  console.warn('[Auth] User suspended:', reason);

  // Set suspension state
  state.isSuspended = true;
  state.suspensionReason = reason;
  state.isAuthenticated = false;
  state.user = null;
  state.subscription = null;

  // Show native notification
  try {
    if (window.electronAPI?.ipc) {
      window.electronAPI.ipc.send('show-notification', {
        title: 'Account Suspended',
        body: reason || 'Your account has been suspended. Please contact support.',
      });
    }
  } catch (error) {
    console.error('Failed to show suspension notification:', error);
  }

  // Clear tokens from storage
  await authService.logout();
}

/**
 * Handle session revocation
 * Called when backend returns SESSION_REVOKED error
 */
async function handleSessionRevoked(): Promise<void> {
  console.warn('[Auth] Session revoked by administrator');

  // Set session revoked state
  state.sessionRevoked = true;
  state.isAuthenticated = false;
  state.user = null;
  state.subscription = null;

  // Show native notification
  try {
    if (window.electronAPI?.ipc) {
      window.electronAPI.ipc.send('show-notification', {
        title: 'Session Terminated',
        body: 'Your session has been terminated. Please sign in again.',
      });
    }
  } catch (error) {
    console.error('Failed to show session revoked notification:', error);
  }

  // Clear tokens from storage
  await authService.logout();
}

/**
 * Clear suspension state (for retry after suspension lifted)
 */
function clearSuspension(): void {
  state.isSuspended = false;
  state.suspensionReason = null;
}

/**
 * Clear session revoked state (for retry after re-login)
 */
function clearSessionRevoked(): void {
  state.sessionRevoked = false;
}

/**
 * Refresh subscription status from the backend
 */
async function refreshSubscription(): Promise<void> {
  if (!state.isAuthenticated) return;

  try {
    state.subscription = await authService.getSubscriptionStatus();
  } catch (error) {
    console.error('Failed to refresh subscription:', error);
    state.subscription = { active: false, status: 'error', message: 'Failed to check subscription' };
  }
}

/**
 * Open checkout for subscription
 */
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

/**
 * Open customer portal for subscription management
 */
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

/**
 * Clear any error message
 */
function clearError(): void {
  state.error = null;
}

// Export the store
export const authStore = {
  // State (readonly to prevent direct mutations)
  state: readonly(state),

  // Computed
  isActive,
  isTrialing,
  trialDaysLeft,
  subscriptionStatus,
  canUseApp,
  needsSubscription,

  // Actions
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
