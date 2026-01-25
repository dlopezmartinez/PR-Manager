import { ref, watch, onUnmounted } from 'vue';
import { usePolling } from './usePolling';
import { authService } from '../services/authService';
import { authStore } from '../stores/authStore';

const AUTH_HEALTH_INTERVAL_MS =
  parseInt(import.meta.env.VITE_AUTH_HEALTH_INTERVAL || '600') * 1000;

export function useAuthHealthPolling() {
  const isActive = ref(false);
  let pollingInstance: ReturnType<typeof usePolling> | null = null;

  async function checkAuthHealth(): Promise<void> {
    if (!authStore.state.isAuthenticated) {
      return;
    }

    console.log('[AuthHealthPolling] Checking token validity...');

    const isValid = await authService.checkHealth();

    if (!isValid) {
      console.error('[AuthHealthPolling] Token is invalid/expired');

      stopPolling();

      await authStore.handleExpiredToken();
    } else {
      console.log('[AuthHealthPolling] Token is valid');
    }
  }

  function startPolling(): void {
    if (isActive.value || pollingInstance) return;

    console.log('[AuthHealthPolling] Starting auth health polling');
    isActive.value = true;

    pollingInstance = usePolling({
      onPoll: checkAuthHealth,
      immediate: true,
      pollTimeout: 10000,
      interval: AUTH_HEALTH_INTERVAL_MS,
    });

    pollingInstance.startPolling();
  }

  function stopPolling(): void {
    if (!isActive.value || !pollingInstance) return;

    console.log('[AuthHealthPolling] Stopping auth health polling');
    isActive.value = false;
    pollingInstance.stopPolling();
    pollingInstance = null;
  }

  watch(
    () => authStore.state.isAuthenticated,
    (authenticated) => {
      if (authenticated && !isActive.value) {
        startPolling();
      } else if (!authenticated && isActive.value) {
        stopPolling();
      }
    }
  );

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
