import { ref, watch, onUnmounted, computed } from 'vue';
import { configStore } from '../stores/configStore';
import { COUNTDOWN_UPDATE_INTERVAL_MS } from '../utils/constants';
import { pollingLogger } from '../utils/logger';

export interface UsePollingOptions {
  onPoll: () => Promise<void> | void;
  immediate?: boolean;
  pollTimeout?: number;
  interval?: number;
}

export function usePolling(options: UsePollingOptions) {
  const { onPoll, immediate = false, pollTimeout = 30000, interval: customInterval } = options;

  let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let countdownId: ReturnType<typeof setInterval> | null = null;
  const isPolling = ref(false);
  const lastPollTime = ref<Date | null>(null);
  const nextPollIn = ref<number>(0);
  let isPollInProgress = false;

  const isEnabled = computed(() => configStore.pollingEnabled);
  const interval = computed(() =>
    customInterval !== undefined
      ? customInterval
      : configStore.pollingInterval * 1000
  );
  const isBackgroundPollingEnabled = computed(() => configStore.backgroundPolling);

  function clearAllTimers(): void {
    if (pollTimeoutId) {
      clearTimeout(pollTimeoutId);
      pollTimeoutId = null;
    }
    if (countdownId) {
      clearInterval(countdownId);
      countdownId = null;
    }
  }

  async function executePoll(scheduleNext = true): Promise<void> {
    if (isPollInProgress) {
      pollingLogger.debug('Poll already in progress, skipping');
      return;
    }

    isPollInProgress = true;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Poll timeout')), pollTimeout);
      });

      await Promise.race([
        Promise.resolve(onPoll()),
        timeoutPromise,
      ]);

      lastPollTime.value = new Date();
    } catch (e) {
      if (e instanceof Error && e.message === 'Poll timeout') {
        pollingLogger.warn('Poll timed out after', pollTimeout, 'ms');
      } else {
        pollingLogger.error('Polling error:', e);
      }
      lastPollTime.value = new Date();
    } finally {
      isPollInProgress = false;

      if (scheduleNext && isPolling.value && isEnabled.value) {
        scheduleNextPoll();
      }
    }
  }

  function scheduleNextPoll(): void {
    if (pollTimeoutId) {
      clearTimeout(pollTimeoutId);
    }

    pollingLogger.debug(`Scheduling next poll in ${interval.value / 1000}s`);

    pollTimeoutId = setTimeout(() => {
      pollTimeoutId = null;
      pollingLogger.debug('Poll timer fired, executing poll...');
      executePoll();
    }, interval.value);
  }

  function startPolling(): void {
    pollingLogger.debug(`startPolling called: isEnabled=${isEnabled.value}, isPolling=${isPolling.value}`);

    if (!isEnabled.value) {
      pollingLogger.debug('startPolling: Polling is disabled, not starting');
      return;
    }
    if (isPolling.value) {
      pollingLogger.debug('startPolling: Already polling, not starting again');
      return;
    }

    clearAllTimers();

    isPolling.value = true;
    pollingLogger.debug('Starting polling with interval:', interval.value, 'ms');

    updateCountdown();
    countdownId = setInterval(updateCountdown, COUNTDOWN_UPDATE_INTERVAL_MS);

    if (immediate) {
      executePoll();
    } else {
      lastPollTime.value = new Date();
      scheduleNextPoll();
    }
  }

  function stopPolling(): void {
    clearAllTimers();
    isPolling.value = false;
    nextPollIn.value = 0;
    isPollInProgress = false;
    pollingLogger.debug('Polling stopped');
  }

  function restartPolling(): void {
    stopPolling();
    if (isEnabled.value) {
      startPolling();
    }
  }

  async function pollNow(): Promise<void> {
    if (!isEnabled.value) return;

    if (pollTimeoutId) {
      clearTimeout(pollTimeoutId);
      pollTimeoutId = null;
    }

    await executePoll();
  }

  function updateCountdown(): void {
    if (!lastPollTime.value) {
      nextPollIn.value = Math.floor(interval.value / 1000);
      return;
    }
    const elapsed = Date.now() - lastPollTime.value.getTime();
    const remaining = Math.max(0, interval.value - elapsed);
    nextPollIn.value = Math.floor(remaining / 1000);
  }

  watch(isEnabled, (enabled) => {
    if (enabled) {
      startPolling();
    } else {
      stopPolling();
    }
  });

  watch(interval, () => {
    if (isEnabled.value && isPolling.value) {
      restartPolling();
    }
  });

  function handleVisibilityChange(): void {
    const isHidden = document.hidden || document.visibilityState === 'hidden';

    pollingLogger.debug(`Visibility changed: hidden=${isHidden}, backgroundPolling=${isBackgroundPollingEnabled.value}, isPolling=${isPolling.value}`);

    if (isBackgroundPollingEnabled.value) {
      if (!isHidden && isEnabled.value) {
        pollingLogger.debug('Window became visible with background polling, triggering immediate poll');
        pollNow().catch((e: Error) => pollingLogger.error('Poll on visibility failed', { error: e.message }));
      }
      return;
    }

    if (isHidden) {
      pollingLogger.debug('Window hidden, pausing polling (background polling disabled)');
      stopPolling();
    } else if (isEnabled.value) {
      pollingLogger.debug('Window visible, resuming polling');
      lastPollTime.value = null;
      startPolling();
    }
  }

  function handleFocusChange(): void {
    if (isBackgroundPollingEnabled.value) return;

    if (document.hasFocus() && isEnabled.value && !isPolling.value) {
      pollingLogger.debug('Window focused, resuming polling');
      startPolling();
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleFocusChange);

  onUnmounted(() => {
    stopPolling();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleFocusChange);
  });

  return {
    isPolling,
    lastPollTime,
    nextPollIn,
    startPolling,
    stopPolling,
    restartPolling,
    pollNow,
  };
}
