/**
 * Auth Health Polling Composable
 *
 * Periodically checks if JWT token is still valid using lightweight /auth/health endpoint.
 * Integrates with existing usePolling infrastructure.
 *
 * The HTTP interceptor handles:
 * - Token refresh on TOKEN_EXPIRED
 * - User suspension detection (USER_SUSPENDED)
 * - Session revocation detection (SESSION_REVOKED)
 *
 * This composable just triggers the health check; error handling is centralized in the HTTP interceptor.
 */

import { ref, watch, onUnmounted } from 'vue';
import { usePolling } from './usePolling';
import { authService } from '../services/authService';
import { authStore } from '../stores/authStore';

// Auth health check interval (10 minutes = 600 seconds)
// Configurable via env: VITE_AUTH_HEALTH_INTERVAL
const AUTH_HEALTH_INTERVAL_MS =
  parseInt(import.meta.env.VITE_AUTH_HEALTH_INTERVAL || '600') * 1000;

export function useAuthHealthPolling() {
  const isActive = ref(false);
  let pollingInstance: ReturnType<typeof usePolling> | null = null;

  /**
   * Check auth health
   * Called by polling mechanism
   */
  async function checkAuthHealth(): Promise<void> {
    // Skip if not authenticated
    if (!authStore.state.isAuthenticated) {
      return;
    }

    console.log('[AuthHealthPolling] Checking token validity...');

    const isValid = await authService.checkHealth();

    if (!isValid) {
      console.error('[AuthHealthPolling] Token is invalid/expired');

      // Stop polling before handling expiration
      stopPolling();

      // Handle expired token (clears auth, shows notification)
      await authStore.handleExpiredToken();
    } else {
      console.log('[AuthHealthPolling] Token is valid');
    }
  }

  /**
   * Start auth health polling
   */
  function startPolling(): void {
    if (isActive.value || pollingInstance) return;

    console.log('[AuthHealthPolling] Starting auth health polling');
    isActive.value = true;

    // Create polling instance with custom interval (10 min)
    // This is independent from PR polling which uses configStore.pollingInterval
    pollingInstance = usePolling({
      onPoll: checkAuthHealth,
      immediate: true, // Check immediately on start
      pollTimeout: 10000, // 10 second timeout
      interval: AUTH_HEALTH_INTERVAL_MS, // Custom interval (10 min)
    });

    pollingInstance.startPolling();
  }

  /**
   * Stop auth health polling
   */
  function stopPolling(): void {
    if (!isActive.value || !pollingInstance) return;

    console.log('[AuthHealthPolling] Stopping auth health polling');
    isActive.value = false;
    pollingInstance.stopPolling();
    pollingInstance = null;
  }

  // Watch for auth state changes
  watch(
    () => authStore.state.isAuthenticated,
    (authenticated) => {
      if (authenticated && !isActive.value) {
        // User just authenticated - start polling
        startPolling();
      } else if (!authenticated && isActive.value) {
        // User logged out - stop polling
        stopPolling();
      }
    }
  );

  // Watch for suspension/revocation to stop polling
  watch(
    () => authStore.state.isSuspended,
    (suspended) => {
      if (suspended && isActive.value) {
        console.log('[AuthHealthPolling] User suspended, stopping polling');
        stopPolling();
      }
    }
  );

  watch(
    () => authStore.state.sessionRevoked,
    (revoked) => {
      if (revoked && isActive.value) {
        console.log('[AuthHealthPolling] Session revoked, stopping polling');
        stopPolling();
      }
    }
  );

  // Cleanup on unmount
  onUnmounted(() => {
    if (isActive.value) {
      stopPolling();
    }
  });

  return {
    isActive,
    startPolling,
    stopPolling,
  };
}
