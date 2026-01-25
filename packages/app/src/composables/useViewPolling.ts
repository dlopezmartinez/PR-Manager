import { watch, ref, onUnmounted, getCurrentInstance } from 'vue';
import { usePolling } from './usePolling';
import { useGitProvider } from './useGitProvider';
import { viewStore, activeView } from '../stores/viewStore';
import { useViewState } from './useViewState';
import { ViewAdapter } from '../adapters/ViewAdapter';
import { configStore } from '../stores/configStore';
import { pollingLogger } from '../utils/logger';
import { notificationManager } from '../managers/NotificationManager';
import { getFollowUpService } from '../services/FollowUpService';
import { isNotificationsView } from '../config/default-views';

const VIEW_SWITCH_DEBOUNCE_MS = 300;

/**
 * View-aware polling composable.
 * Only polls the currently active view and debounces view switches
 * to prevent rapid re-polling during quick navigation.
 */
export function useViewPolling() {
  const provider = useGitProvider();
  const viewAdapter = new ViewAdapter(provider.pullRequests);

  const currentRefreshId = ref(0);

  async function refreshActiveView(): Promise<void> {
    const view = activeView.value;
    if (!view) {
      pollingLogger.warn('No active view to refresh');
      return;
    }

    const refreshId = ++currentRefreshId.value;
    const viewState = useViewState(view.id);

    pollingLogger.debug(`Polling view: ${view.name} (${view.id})`);

    pollFollowedPRs();

    if (isNotificationsView(view.id)) {
      pollingLogger.debug('Notifications view is active, skipping API polling');
      return;
    }

    try {
      const result = await viewAdapter.getViewData(
        view,
        configStore.username || undefined
      );

      if (currentRefreshId.value !== refreshId) {
        pollingLogger.debug(`View changed during fetch, discarding results for ${view.id}`);
        return;
      }

      viewState.prs.value = result.prs;
      viewState.pageInfo.value = result.pageInfo;
      viewState.lastFetched.value = new Date();
      viewState.error.value = '';

      pollingLogger.debug(`Successfully polled view ${view.id}: ${result.prs.length} PRs`);

      pollingLogger.debug('Processing notifications for potential changes...');
      notificationManager.processUpdate(result.prs).catch(err => {
        pollingLogger.error('Notification processing error:', err);
      });
    } catch (e) {
      if (currentRefreshId.value === refreshId) {
        pollingLogger.error(`Error polling view ${view.id}:`, e);
        viewState.error.value = e instanceof Error ? e.message : 'Polling failed';
      }
    }
  }

  async function pollFollowedPRs(): Promise<void> {
    if (!configStore.followUpEnabled) {
      return;
    }

    const followUpService = getFollowUpService();
    if (!followUpService) {
      pollingLogger.debug('FollowUpService not initialized, skipping follow-up polling');
      return;
    }

    try {
      const result = await followUpService.pollFollowedPRs();
      if (result.changesDetected > 0) {
        pollingLogger.debug(
          `Follow-up polling: ${result.changesDetected} changes detected, ${result.notificationsCreated.length} notifications created`
        );
      }
    } catch (e) {
      pollingLogger.error('Follow-up polling error:', e);
    }
  }

  const { isPolling, nextPollIn, lastPollTime, startPolling, stopPolling, restartPolling, pollNow } =
    usePolling({
      onPoll: refreshActiveView,
      immediate: false,
      pollTimeout: 30000,
    });

  let viewSwitchTimer: ReturnType<typeof setTimeout> | null = null;

  watch(
    () => viewStore.activeViewId,
    (newViewId, oldViewId) => {
      if (newViewId !== oldViewId) {
        pollingLogger.debug(`View changed from ${oldViewId} to ${newViewId}`);

        if (viewSwitchTimer) {
          clearTimeout(viewSwitchTimer);
        }

        viewSwitchTimer = setTimeout(() => {
          viewSwitchTimer = null;

          if (isPolling.value) {
            pollingLogger.debug(`Triggering poll for new view: ${newViewId}`);
            pollNow().catch(console.error);
          }
        }, VIEW_SWITCH_DEBOUNCE_MS);
      }
    }
  );

  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (viewSwitchTimer) {
        clearTimeout(viewSwitchTimer);
        viewSwitchTimer = null;
      }
    });
  }

  return {
    isPolling,
    nextPollIn,
    lastPollTime,
    startPolling,
    stopPolling,
    restartPolling,
    refreshActiveView,
  };
}
