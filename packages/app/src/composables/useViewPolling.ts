import { watch, ref } from 'vue';
import { usePolling } from './usePolling';
import { useGitProvider } from './useGitProvider';
import { activeView } from '../stores/viewStore';
import { useViewState } from './useViewState';
import { ViewAdapter } from '../adapters/ViewAdapter';
import { configStore } from '../stores/configStore';
import { pollingLogger } from '../utils/logger';
import { getFollowUpService } from '../services/FollowUpService';
import { isNotificationsView, isPinnedView } from '../config/default-views';
import { followedCount } from '../stores/followUpStore';

/**
 * View-aware polling composable.
 * Auto-polling ONLY polls follow-up PRs.
 * Active view is only refreshed on manual refresh.
 */
export function useViewPolling() {
  const provider = useGitProvider();
  const viewAdapter = new ViewAdapter(provider.pullRequests);

  const currentRefreshId = ref(0);

  /**
   * Poll only followed PRs - called automatically by the polling interval.
   * Does NOT refresh the active view.
   */
  async function pollFollowedPRsOnly(): Promise<void> {
    if (!configStore.followUpEnabled) {
      pollingLogger.debug('Follow-up disabled, skipping poll');
      return;
    }

    const count = followedCount.value;
    if (count === 0) {
      pollingLogger.debug('No followed PRs, skipping poll');
      return;
    }

    await pollFollowedPRs();
  }

  /**
   * Full refresh of active view + followed PRs.
   * Called on manual refresh.
   */
  async function refreshActiveView(): Promise<void> {
    const view = activeView.value;
    if (!view) {
      pollingLogger.warn('No active view to refresh');
      return;
    }

    const refreshId = ++currentRefreshId.value;
    const viewState = useViewState(view.id);

    pollingLogger.debug(`Refreshing view: ${view.name} (${view.id})`);

    // IMPORTANT: Await pollFollowedPRs so notifications are created before returning
    await pollFollowedPRs();

    // Skip API polling for special views that manage their own data
    if (isNotificationsView(view.id) || isPinnedView(view.id)) {
      pollingLogger.debug(`Special view ${view.id} is active, skipping API polling`);
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

      pollingLogger.debug(`Successfully refreshed view ${view.id}: ${result.prs.length} PRs`);

      // NOTE: Notifications are handled exclusively by FollowUpService for followed PRs.
      // View refreshes should NOT trigger notifications.
    } catch (e) {
      if (currentRefreshId.value === refreshId) {
        pollingLogger.error(`Error refreshing view ${view.id}:`, e);
        viewState.error.value = e instanceof Error ? e.message : 'Refresh failed';
      }
    }
  }

  async function pollFollowedPRs(): Promise<void> {
    pollingLogger.debug('pollFollowedPRs called');

    if (!configStore.followUpEnabled) {
      pollingLogger.debug('pollFollowedPRs: followUpEnabled is false, skipping');
      return;
    }

    const followUpService = getFollowUpService();
    if (!followUpService) {
      pollingLogger.debug('FollowUpService not initialized, skipping follow-up polling');
      return;
    }

    pollingLogger.debug('pollFollowedPRs: Calling followUpService.pollFollowedPRs()');

    try {
      const result = await followUpService.pollFollowedPRs();
      pollingLogger.debug(
        `Follow-up polling complete: checked=${result.checked}, changesDetected=${result.changesDetected}, notificationsCreated=${result.notificationsCreated.length}`
      );
      if (result.errors.length > 0) {
        pollingLogger.warn('Follow-up polling had errors:', result.errors);
      }
    } catch (e) {
      pollingLogger.error('Follow-up polling error:', e);
    }
  }

  const { isPolling, nextPollIn, lastPollTime, startPolling, stopPolling, restartPolling } =
    usePolling({
      onPoll: pollFollowedPRsOnly,
      immediate: false,
      pollTimeout: 30000,
    });

  // Watch followed count to start/stop polling appropriately
  // immediate: true ensures polling starts if there are already followed PRs on app load
  watch(
    followedCount,
    (count) => {
      pollingLogger.debug(`followedCount watch triggered: count=${count}, isPolling=${isPolling.value}, pollingEnabled=${configStore.pollingEnabled}`);

      if (count === 0 && isPolling.value) {
        pollingLogger.debug('No followed PRs, stopping auto-poll');
        stopPolling();
      } else if (count > 0 && !isPolling.value && configStore.pollingEnabled) {
        pollingLogger.debug('Followed PRs detected, starting auto-poll');
        startPolling();
      } else if (count > 0 && !configStore.pollingEnabled) {
        pollingLogger.debug('Followed PRs exist but polling is disabled in settings');
      } else if (count > 0 && isPolling.value) {
        pollingLogger.debug('Followed PRs exist and polling is already running');
      }
    },
    { immediate: true }
  );

  // Removed automatic polling on view switch - views only refresh on manual action

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
