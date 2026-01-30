/**
 * SessionManager - Centralized session and subscription state management
 *
 * Single source of truth for:
 * - JWT validity (7 day expiration)
 * - Subscription status (embedded in JWT)
 * - Grace periods (6h after subscription expires)
 * - Background sync (required every 12h)
 * - Single session enforcement (one device per account)
 *
 * Simple rule: If 12 hours pass without a successful sync, the app blocks
 * and requires the user to log out and back in.
 */

import { reactive, computed, readonly } from 'vue';
import { decodeJWT, isTokenExpired, type SubscriptionClaims } from '../utils/jwt';
import { httpGet } from './http';
import { API_URL } from '../config/api';
import { sessionLogger } from '../utils/logger';

// =============================================================================
// Constants - All timing in one place
// =============================================================================

const MAX_TIME_WITHOUT_SYNC_MS = 12 * 60 * 60 * 1000;   // 12 hours without sync = sync required
const SYNC_WARNING_MS = 11 * 60 * 60 * 1000;            // Warning at 11h without sync
const GRACE_PERIOD_MS = 6 * 60 * 60 * 1000;             // 6 hours - after subscription expires
const WARNING_BEFORE_EXPIRY_MS = 2 * 60 * 60 * 1000;    // 2 hours - show warning before expiry
const CHECK_INTERVAL_MS = 60 * 1000;                     // 1 minute - state check frequency
const SILENT_SYNC_INTERVAL_MS = 5 * 60 * 1000;          // 5 minutes - silent sync frequency

// =============================================================================
// Types
// =============================================================================

export type SessionState =
  | 'ok'                      // Everything fine, app usable
  | 'warning_subscription'    // Subscription expired, grace period ending soon
  | 'warning_session'         // JWT expiring soon, can't refresh
  | 'warning_sync'            // Approaching 12h usage, sync needed soon
  | 'expired';                // Must redirect to login

export type SessionHealthLevel = 'healthy' | 'degraded' | 'critical';

export type SyncRequiredReason =
  | 'usage_limit'             // 12h usage reached, sync failed
  | 'session_replaced'        // Another device logged in
  | null;

interface SessionManagerState {
  state: SessionState;
  healthLevel: SessionHealthLevel;

  // JWT info
  jwtExpiresAt: number | null;         // Unix timestamp ms

  // Subscription info
  subscriptionClaims: SubscriptionClaims | null;
  subscriptionExpiresAt: number | null; // Unix timestamp ms

  // Grace period (starts when subscription expires)
  gracePeriodEndsAt: number | null;    // Unix timestamp ms

  // Sync info
  lastSyncAt: number | null;           // Unix timestamp ms
  lastSyncError: string | null;
  sessionStartedAt: number | null;     // When session started (for 12h sync tracking)

  // Sync required state (blocks app)
  syncRequired: boolean;               // True = show blocking modal
  syncRequiredReason: SyncRequiredReason;

  // For Settings display
  isOnline: boolean;
}

type ExpiredCallback = () => void;

// =============================================================================
// State
// =============================================================================

const state = reactive<SessionManagerState>({
  state: 'ok',
  healthLevel: 'healthy',
  jwtExpiresAt: null,
  subscriptionClaims: null,
  subscriptionExpiresAt: null,
  gracePeriodEndsAt: null,
  lastSyncAt: null,
  lastSyncError: null,
  sessionStartedAt: null,
  syncRequired: false,
  syncRequiredReason: null,
  isOnline: true,
});

let checkIntervalId: ReturnType<typeof setInterval> | null = null;
let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let onExpiredCallback: ExpiredCallback | null = null;
let deviceId: string | null = null;

// =============================================================================
// Computed values for external use
// =============================================================================

const sessionState = computed(() => state.state);
const healthLevel = computed(() => state.healthLevel);
const isOnline = computed(() => state.isOnline);
const subscriptionClaims = computed(() => state.subscriptionClaims);
const syncRequired = computed(() => state.syncRequired);
const syncRequiredReason = computed(() => state.syncRequiredReason);

const canUseApp = computed(() => {
  // Can't use app if sync is required (blocking)
  if (state.syncRequired) return false;

  return state.state === 'ok' ||
         state.state === 'warning_subscription' ||
         state.state === 'warning_session' ||
         state.state === 'warning_sync';
});

// For Settings - detailed status
const statusDetails = computed(() => ({
  jwtExpiresAt: state.jwtExpiresAt,
  subscriptionExpiresAt: state.subscriptionExpiresAt,
  gracePeriodEndsAt: state.gracePeriodEndsAt,
  lastSyncAt: state.lastSyncAt,
  lastSyncError: state.lastSyncError,
  sessionStartedAt: state.sessionStartedAt,
  isOnline: state.isOnline,
}));

// =============================================================================
// Sync Time Tracking - 12h since last sync requires new sync
// =============================================================================

/**
 * Check if 12 hours have passed since last sync (or session start).
 * If so, force a sync. If sync fails, block the app.
 */
async function checkSyncRequired(): Promise<void> {
  const referenceTime = state.lastSyncAt || state.sessionStartedAt;
  if (!referenceTime) return;

  const timeSinceSync = Date.now() - referenceTime;
  const timeUntilSyncRequired = MAX_TIME_WITHOUT_SYNC_MS - timeSinceSync;

  if (timeUntilSyncRequired <= 0) {
    sessionLogger.info('12h since last sync, forcing sync...');

    const syncSuccess = await attemptForcedSync();

    if (!syncSuccess) {
      sessionLogger.info('Forced sync failed, blocking app');
      state.syncRequired = true;
      state.syncRequiredReason = 'usage_limit';
      stopManager();
    }
  } else if (timeUntilSyncRequired <= (MAX_TIME_WITHOUT_SYNC_MS - SYNC_WARNING_MS)) {
    if (state.state !== 'warning_sync') {
      sessionLogger.info('Approaching 12h without sync, sync needed soon');
      updateState('warning_sync', 'critical');
    }
  }
}

// =============================================================================
// Core Logic - Single check function
// =============================================================================

function checkState(): void {
  const now = Date.now();

  // 0. If sync is required, don't change state
  if (state.syncRequired) {
    return;
  }

  // 1. Check JWT expiration
  if (state.jwtExpiresAt) {
    const timeUntilJwtExpiry = state.jwtExpiresAt - now;

    if (timeUntilJwtExpiry <= 0) {
      // JWT expired
      transitionToExpired('jwt_expired');
      return;
    }

    if (timeUntilJwtExpiry <= WARNING_BEFORE_EXPIRY_MS && !state.isOnline) {
      // JWT expiring soon and we can't refresh
      updateState('warning_session', 'critical');
      return;
    }
  }

  // 2. Check if subscription is not active
  if (state.subscriptionClaims && !state.subscriptionClaims.active) {
    // Subscription is not active - check if grace period applies

    if (state.subscriptionExpiresAt) {
      // Had a subscription that expired - grace period based on expiresAt from DB
      const gracePeriodEndsAt = state.subscriptionExpiresAt + GRACE_PERIOD_MS;
      const timeUntilGraceEnds = gracePeriodEndsAt - now;

      if (timeUntilGraceEnds <= 0) {
        // Grace period ended (more than 6h since subscription expired)
        transitionToExpired('grace_period_ended');
        return;
      }

      if (timeUntilGraceEnds <= WARNING_BEFORE_EXPIRY_MS) {
        // Grace period ending soon - show warning
        updateState('warning_subscription', 'critical');
        return;
      }

      sessionLogger.debug(`In grace period, ${Math.round(timeUntilGraceEnds / 1000 / 60)} minutes remaining`);
      updateState('ok', 'degraded');
      return;
    } else {
      // Never had a subscription (expiresAt is null) - no grace period
      transitionToExpired('no_subscription');
      return;
    }
  }

  // 3. Check if approaching 12h without sync
  const referenceTime = state.lastSyncAt || state.sessionStartedAt;
  if (referenceTime) {
    const timeSinceSync = Date.now() - referenceTime;
    if (timeSinceSync >= SYNC_WARNING_MS) {
      updateState('warning_sync', 'critical');
      return;
    }
  }

  // 4. All good
  updateState('ok', state.isOnline ? 'healthy' : 'degraded');
}

function updateState(newState: SessionState, newHealth: SessionHealthLevel): void {
  if (state.state !== newState || state.healthLevel !== newHealth) {
    const wasExpired = state.state === 'expired';
    sessionLogger.debug(`State: ${state.state} -> ${newState}, Health: ${state.healthLevel} -> ${newHealth}`);
    state.state = newState;
    state.healthLevel = newHealth;

    if (wasExpired && newState !== 'expired') {
      sessionLogger.info('Recovered from expired state, restarting manager');
      startManager();
    }
  }
}

function transitionToExpired(reason: string): void {
  sessionLogger.warn(`Session expired: ${reason}`);
  state.state = 'expired';
  state.healthLevel = 'critical';
  stopManager();

  // Only trigger logout callback for actual session/JWT issues
  const sessionIssues = ['jwt_expired', 'token_expired', 'invalid_token', 'sync_auth_failed'];
  if (onExpiredCallback && sessionIssues.includes(reason)) {
    onExpiredCallback();
  }
}

// =============================================================================
// Sync Logic
// =============================================================================

async function attemptForcedSync(): Promise<boolean> {
  try {
    if (!deviceId) {
      deviceId = await window.electronAPI.session.getDeviceId();
    }

    sessionLogger.debug('Attempting forced sync with deviceId:', deviceId);

    const response = await httpGet(`${API_URL}/auth/sync`, {
      headers: { 'X-Device-Id': deviceId },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));

      if (response.status === 403 && data.code === 'SESSION_REPLACED') {
        sessionLogger.warn('Session replaced by another device');
        state.syncRequired = true;
        state.syncRequiredReason = 'session_replaced';
        return false;
      }

      if (response.status === 401 || response.status === 403) {
        transitionToExpired('sync_auth_failed');
        return false;
      }

      // Other error - sync failed
      state.isOnline = false;
      state.lastSyncError = `HTTP ${response.status}`;
      return false;
    }

    return await processSyncResponse(response);
  } catch (error) {
    sessionLogger.error('Forced sync error:', error);
    state.isOnline = false;
    state.lastSyncError = error instanceof Error ? error.message : 'Network error';
    return false;
  }
}

async function silentSync(): Promise<boolean> {
  try {
    if (!deviceId) {
      deviceId = await window.electronAPI.session.getDeviceId();
    }

    sessionLogger.debug('Starting silent sync...');

    const response = await httpGet(`${API_URL}/auth/sync`, {
      headers: { 'X-Device-Id': deviceId },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));

      if (response.status === 403 && data.code === 'SESSION_REPLACED') {
        sessionLogger.warn('Session replaced by another device');
        state.syncRequired = true;
        state.syncRequiredReason = 'session_replaced';
        stopManager();
        return false;
      }

      if (response.status === 401 || response.status === 403) {
        transitionToExpired('sync_auth_failed');
        return false;
      }

      state.isOnline = false;
      state.lastSyncError = `HTTP ${response.status}`;
      sessionLogger.debug('Sync failed, continuing offline');
      return false;
    }

    return await processSyncResponse(response);
  } catch (error) {
    state.isOnline = false;
    state.lastSyncError = error instanceof Error ? error.message : 'Network error';
    sessionLogger.debug('Sync error, continuing offline:', error);
    return false;
  }
}

async function processSyncResponse(response: Response): Promise<boolean> {
  const data = await response.json();

  // Update token
  if (data.accessToken) {
    await window.electronAPI.auth.setToken(data.accessToken);

    // Re-parse JWT for new expiration
    const payload = decodeJWT(data.accessToken);
    if (payload?.exp) {
      state.jwtExpiresAt = payload.exp * 1000;
    }
  }

  // Update subscription claims
  if (data.subscription) {
    state.subscriptionClaims = data.subscription;
    state.subscriptionExpiresAt = data.subscription.expiresAt
      ? data.subscription.expiresAt * 1000
      : null;

    // If subscription is now active, clear grace period
    if (data.subscription.active) {
      state.gracePeriodEndsAt = null;
    }
  }

  // Update sync timestamp
  const now = Date.now();
  state.lastSyncAt = now;
  state.lastSyncError = null;
  state.isOnline = true;

  await window.electronAPI.session.setLastSyncAt(now);

  sessionLogger.debug('Sync successful');

  checkState();

  return true;
}

// =============================================================================
// Public API
// =============================================================================

async function initialize(token: string, onExpired: ExpiredCallback): Promise<void> {
  sessionLogger.info('Initializing...');

  onExpiredCallback = onExpired;

  const payload = decodeJWT(token);

  if (!payload) {
    sessionLogger.error('Invalid token');
    transitionToExpired('invalid_token');
    return;
  }

  if (isTokenExpired(payload)) {
    sessionLogger.error('Token already expired');
    transitionToExpired('token_expired');
    return;
  }

  deviceId = await window.electronAPI.session.getDeviceId();
  sessionLogger.debug('Device ID:', deviceId);

  const savedLastSync = await window.electronAPI.session.getLastSyncAt();
  if (savedLastSync) {
    state.lastSyncAt = savedLastSync;
    sessionLogger.debug(`Loaded last sync: ${new Date(savedLastSync).toISOString()}`);
  }
  state.sessionStartedAt = Date.now();

  // Set JWT expiration
  if (payload.exp) {
    state.jwtExpiresAt = payload.exp * 1000;
  }

  // Set subscription info
  if (payload.subscription) {
    state.subscriptionClaims = payload.subscription;
    state.subscriptionExpiresAt = payload.subscription.expiresAt
      ? payload.subscription.expiresAt * 1000
      : null;
  } else {
    state.subscriptionClaims = {
      active: true,
      status: 'unknown',
      plan: null,
      expiresAt: null,
    };
    sessionLogger.debug('Token without subscription claims, assuming active until sync');
  }

  // Reset sync required state
  state.syncRequired = false;
  state.syncRequiredReason = null;
  state.gracePeriodEndsAt = null;
  state.lastSyncError = null;
  state.isOnline = true;

  // Initial state check
  checkState();

  // Start the manager
  startManager();

  // Initial sync after short delay
  setTimeout(() => silentSync(), 5000);

  // Check if we already exceeded 12h without sync
  await checkSyncRequired();
}

function startManager(): void {
  if (checkIntervalId) return;

  checkIntervalId = setInterval(() => {
    checkState();
    checkSyncRequired();
  }, CHECK_INTERVAL_MS);

  syncIntervalId = setInterval(() => {
    silentSync();
  }, SILENT_SYNC_INTERVAL_MS);

  sessionLogger.debug('Started (check: 1min, sync: 5min)');
}

function stopManager(): void {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
  }
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
  sessionLogger.debug('Stopped');
}

async function reset(): Promise<void> {
  stopManager();

  state.state = 'ok';
  state.healthLevel = 'healthy';
  state.jwtExpiresAt = null;
  state.subscriptionClaims = null;
  state.subscriptionExpiresAt = null;
  state.gracePeriodEndsAt = null;
  state.lastSyncAt = null;
  state.lastSyncError = null;
  state.sessionStartedAt = null;
  state.syncRequired = false;
  state.syncRequiredReason = null;
  state.isOnline = true;

  deviceId = null;
  onExpiredCallback = null;

  sessionLogger.debug('Reset');
}

// Manual sync trigger (for Settings)
async function forceSyncNow(): Promise<boolean> {
  return await silentSync();
}

// =============================================================================
// Export
// =============================================================================

export const sessionManager = {
  // Readonly state
  state: readonly(state),

  // Computed
  sessionState,
  healthLevel,
  isOnline,
  canUseApp,
  subscriptionClaims,
  statusDetails,
  syncRequired,
  syncRequiredReason,

  // Actions
  initialize,
  reset,
  forceSyncNow,
};
