import { reactive, computed, readonly } from 'vue';
import { decodeJWT, isTokenExpired, type SubscriptionClaims, type JWTPayload } from '../utils/jwt';
import { httpGet } from '../services/http';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.prmanager.app';

// Constants
const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000; // 48 hours
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOCALSTORAGE_KEY = 'pr-manager-sync-state';

export type SyncStatus =
  | 'synced'           // Everything OK, subscription verified
  | 'syncing'          // Currently syncing with backend
  | 'network_error'    // No connection, in grace period
  | 'subscription_expired' // Subscription expired (from JWT claims)
  | 'session_expired'; // JWT expired, needs re-login

interface SyncState {
  status: SyncStatus;
  lastSyncAt: number | null;      // Unix timestamp ms
  gracePeriodEndsAt: number | null; // Unix timestamp ms
  subscriptionClaims: SubscriptionClaims | null;
  errorMessage: string | null;
}

interface PersistedSyncState {
  lastSyncAt: number | null;
  gracePeriodEndsAt: number | null;
}

const state = reactive<SyncState>({
  status: 'synced',
  lastSyncAt: null,
  gracePeriodEndsAt: null,
  subscriptionClaims: null,
  errorMessage: null,
});

let syncIntervalId: ReturnType<typeof setInterval> | null = null;

// Computed values
const syncStatus = computed(() => state.status);

const canUseApp = computed(() => {
  // Can use app if:
  // 1. Status is synced or syncing
  // 2. In network_error but within grace period
  if (state.status === 'synced' || state.status === 'syncing') {
    return state.subscriptionClaims?.active ?? false;
  }

  if (state.status === 'network_error') {
    // Check if we're within grace period
    if (state.gracePeriodEndsAt && Date.now() < state.gracePeriodEndsAt) {
      return state.subscriptionClaims?.active ?? false;
    }
  }

  return false;
});

const isInGracePeriod = computed(() => {
  return state.status === 'network_error' &&
    state.gracePeriodEndsAt !== null &&
    Date.now() < state.gracePeriodEndsAt;
});

const gracePeriodRemainingMs = computed(() => {
  if (!state.gracePeriodEndsAt) return 0;
  return Math.max(0, state.gracePeriodEndsAt - Date.now());
});

const gracePeriodRemainingHours = computed(() => {
  return Math.ceil(gracePeriodRemainingMs.value / (60 * 60 * 1000));
});

// Persistence functions
function loadPersistedState(): void {
  try {
    const stored = localStorage.getItem(LOCALSTORAGE_KEY);
    if (stored) {
      const persisted: PersistedSyncState = JSON.parse(stored);
      state.lastSyncAt = persisted.lastSyncAt;
      state.gracePeriodEndsAt = persisted.gracePeriodEndsAt;
    }
  } catch (error) {
    console.error('[SyncStore] Failed to load persisted state:', error);
  }
}

function persistState(): void {
  try {
    const persisted: PersistedSyncState = {
      lastSyncAt: state.lastSyncAt,
      gracePeriodEndsAt: state.gracePeriodEndsAt,
    };
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(persisted));
  } catch (error) {
    console.error('[SyncStore] Failed to persist state:', error);
  }
}

// Main functions
function initFromToken(token: string): void {
  loadPersistedState();

  const payload = decodeJWT(token);

  if (!payload) {
    state.status = 'session_expired';
    state.errorMessage = 'Invalid session token';
    return;
  }

  if (isTokenExpired(payload)) {
    state.status = 'session_expired';
    state.errorMessage = 'Session has expired';
    return;
  }

  state.subscriptionClaims = payload.subscription || null;

  // Check subscription status from claims
  if (payload.subscription) {
    if (!payload.subscription.active) {
      state.status = 'subscription_expired';
      state.errorMessage = 'Your subscription has expired';
    } else {
      state.status = 'synced';
      state.errorMessage = null;
    }
  } else {
    // No subscription claims in token - treat as no subscription
    state.status = 'subscription_expired';
    state.subscriptionClaims = {
      active: false,
      status: 'none',
      plan: null,
      expiresAt: null,
    };
    state.errorMessage = 'No active subscription';
  }

  // Start background sync
  startBackgroundSync();
}

async function syncWithBackend(): Promise<boolean> {
  state.status = 'syncing';

  try {
    const response = await httpGet(`${API_URL}/auth/sync`);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        state.status = 'session_expired';
        state.errorMessage = 'Session has expired';
        stopBackgroundSync();
        return false;
      }

      // Other errors - enter grace period if we have previous sync
      enterGracePeriod();
      return false;
    }

    const data = await response.json();

    // Update local token with new one
    if (data.accessToken) {
      await window.electronAPI.auth.setToken(data.accessToken);
    }

    // Update subscription claims
    if (data.subscription) {
      state.subscriptionClaims = data.subscription;

      if (!data.subscription.active) {
        state.status = 'subscription_expired';
        state.errorMessage = 'Your subscription has expired';
      } else {
        state.status = 'synced';
        state.errorMessage = null;
      }
    }

    // Update sync timestamp
    state.lastSyncAt = Date.now();
    state.gracePeriodEndsAt = null;
    persistState();

    return true;
  } catch (error) {
    console.error('[SyncStore] Sync failed:', error);
    enterGracePeriod();
    return false;
  }
}

function enterGracePeriod(): void {
  state.status = 'network_error';
  state.errorMessage = 'Unable to connect to server';

  // Only set grace period if we had a successful sync before
  if (state.lastSyncAt && !state.gracePeriodEndsAt) {
    state.gracePeriodEndsAt = Date.now() + GRACE_PERIOD_MS;
    persistState();
  }

  // Check if grace period has expired
  if (state.gracePeriodEndsAt && Date.now() >= state.gracePeriodEndsAt) {
    state.status = 'session_expired';
    state.errorMessage = 'Session expired - please reconnect';
    stopBackgroundSync();
  }
}

function startBackgroundSync(): void {
  if (syncIntervalId) return;

  // Initial sync after a short delay
  setTimeout(() => {
    syncWithBackend();
  }, 5000);

  // Periodic sync
  syncIntervalId = setInterval(() => {
    if (state.status !== 'session_expired' && state.status !== 'subscription_expired') {
      syncWithBackend();
    }
  }, SYNC_INTERVAL_MS);
}

function stopBackgroundSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}

function resetSyncState(): void {
  stopBackgroundSync();

  state.status = 'synced';
  state.lastSyncAt = null;
  state.gracePeriodEndsAt = null;
  state.subscriptionClaims = null;
  state.errorMessage = null;

  try {
    localStorage.removeItem(LOCALSTORAGE_KEY);
  } catch (error) {
    console.error('[SyncStore] Failed to clear persisted state:', error);
  }
}

// Manual retry after network error
async function retrySyncManually(): Promise<boolean> {
  return await syncWithBackend();
}

export const subscriptionSyncStore = {
  state: readonly(state),

  // Computed
  syncStatus,
  canUseApp,
  isInGracePeriod,
  gracePeriodRemainingMs,
  gracePeriodRemainingHours,

  // Actions
  initFromToken,
  syncWithBackend,
  resetSyncState,
  retrySyncManually,
};
