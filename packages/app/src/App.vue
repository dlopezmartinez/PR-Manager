<template>
  <ErrorBoundary fallback-message="An error occurred" @error="handleGlobalError">
    <div class="app-container">
      <MissingScopesScreen
        v-if="showMissingScopes"
        :missing-scopes="missingScopes"
        :current-scopes="currentScopes"
        @validated="handleTokenValidated"
        @change-token="handleChangeTokenFromScopes"
      />

      <div v-else-if="!isValidatingToken" class="content-wrapper">
      <TitleBar>
        <template #left>
          <h1 class="app-title">Pull Requests</h1>
        </template>
        <template #right>
          <button
            class="titlebar-btn"
            @click="handleManualRefresh"
            :disabled="currentViewState.loading.value"
            :class="{ 'spinning': currentViewState.loading.value }"
            title="Refresh now"
          >
            <RefreshCw :size="16" :stroke-width="2" />
          </button>
          <div v-if="isPolling && nextPollIn > 0" class="polling-indicator" title="Auto-refresh active">
            <span class="pulse-dot"></span>
            <span class="countdown">{{ nextPollIn }}s</span>
          </div>
          <button
            v-if="isSuperuser"
            class="titlebar-btn"
            @click="showAdminDashboard = true"
            title="Admin Dashboard"
          >
            <Shield :size="16" :stroke-width="2" />
          </button>
          <button class="titlebar-btn" @click="showSettings = true" title="Settings">
            <Settings :size="16" :stroke-width="2" />
          </button>
        </template>
      </TitleBar>

      <TrialBanner />

      <header class="header">
        <div class="header-content">
          <ViewTabs
            :pr-counts="prCounts"
            @add-view="showViewEditor = true"
          />
        </div>
      </header>

      <div v-if="currentViewState.error.value" class="error-banner">
        <AlertTriangle :size="14" :stroke-width="2" class="error-icon" />
        {{ currentViewState.error.value }}
      </div>

      <main class="main-content">
        <NotificationInbox v-if="isNotificationsViewActive" />

        <PinnedPRsView v-else-if="isPinnedViewActive" />

        <ViewContainer
          v-else
          :prs="currentViewState.prs.value"
          :page-info="currentViewState.pageInfo.value"
          :loading="currentViewState.loading.value"
          :show-comments="configStore.showComments"
          :show-checks="configStore.showChecks"
          :allow-comments-expansion="configStore.allowCommentsExpansion"
          :allow-checks-expansion="configStore.allowChecksExpansion"
          @select="selectPR"
          @load-more="loadMore"
          @toggle-expand="handleToggleExpand"
          @toggle-expand-comments="handleToggleExpandComments"
          @prefetch="handlePrefetch"
          @prefetch-cancel="handlePrefetchCancel"
        />
      </main>
    </div>

    <SettingsScreen
      v-if="showSettings"
      @close="showSettings = false"
      @logout="handleLogout"
      @refresh-needed="handleManualRefresh"
      @provider-changed="handleProviderChanged"
    >
      <template #views>
        <ViewManager />
      </template>
    </SettingsScreen>

    <AdminDashboard v-if="showAdminDashboard" @close="showAdminDashboard = false" />

    <ViewEditorDialog
      v-if="showViewEditor"
      @save="handleSaveView"
      @cancel="showViewEditor = false"
    />

    <InAppNotification />
    </div>
  </ErrorBoundary>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { RefreshCw, Settings, AlertTriangle, Shield } from 'lucide-vue-next';
import { useGitProvider } from './composables/useGitProvider';
import { useViewPolling } from './composables/useViewPolling';
import { useAuthHealthPolling } from './composables/useAuthHealthPolling';
import { useViewState, getAllViewStates, clearAllViewStates } from './composables/useViewState';
import { useTheme } from './composables/useTheme';
import { ViewAdapter } from './adapters/ViewAdapter';
import { configStore } from './stores/configStore';
import { viewStore, activeView, addCustomView, isViewVisited, markViewAsVisited } from './stores/viewStore';
import { authStore } from './stores/authStore';
import { updatePrCount, setSyncing, showNotification, initUpdateToken, validateToken } from './utils/electron';
import ErrorBoundary from './components/ErrorBoundary.vue';
import TitleBar from './components/TitleBar.vue';
import ViewTabs from './components/ViewTabs.vue';
import ViewContainer from './components/ViewContainer.vue';
import ViewManager from './components/ViewManager.vue';
import ViewEditorDialog from './components/ViewEditorDialog.vue';
import SettingsScreen from './components/SettingsScreen.vue';
import MissingScopesScreen from './components/MissingScopesScreen.vue';
import InAppNotification from './components/InAppNotification.vue';
import NotificationInbox from './components/NotificationInbox.vue';
import PinnedPRsView from './components/PinnedPRsView.vue';
import TrialBanner from './components/TrialBanner.vue';
import AdminDashboard from './components/AdminDashboard.vue';
import { getApiKey } from './stores/configStore';
import { isNotificationsView, isPinnedView } from './config/default-views';
import { initializeFollowUpService } from './services/FollowUpService';
import { unreadCount } from './stores/notificationInboxStore';
import type { PullRequestBasic } from './model/types';
import type { ViewConfig } from './model/view-types';

useTheme();

const provider = useGitProvider();
const viewAdapter = new ViewAdapter(provider.pullRequests);

const showSettings = ref(false);
const showViewEditor = ref(false);
const showAdminDashboard = ref(false);

const isValidatingToken = ref(false);
const tokenValidationComplete = ref(false);
const missingScopes = ref<string[]>([]);
const currentScopes = ref<string[]>([]);
const showMissingScopes = computed(() =>
  tokenValidationComplete.value && missingScopes.value.length > 0
);

const currentViewState = computed(() => useViewState(activeView.value.id));
const isNotificationsViewActive = computed(() => isNotificationsView(activeView.value.id));
const isPinnedViewActive = computed(() => isPinnedView(activeView.value.id));
const isSuperuser = computed(() => authStore.state.user?.role === 'SUPERUSER');

const prCounts = computed(() => {
  const counts: Record<string, number> = {};
  const allStates = getAllViewStates();

  for (const [viewId, state] of allStates) {
    counts[viewId] = state.prs.value.length;
  }

  counts['notifications'] = unreadCount.value;
  return counts;
});

const { isPolling, nextPollIn, startPolling, restartPolling, refreshActiveView } = useViewPolling();
const authHealthPolling = useAuthHealthPolling();

onMounted(async () => {
  // Initialize update token in main process
  await initUpdateToken();

  // Validate token permissions
  await validateTokenPermissions();

  if (missingScopes.value.length === 0) {
    initializeFollowUpService(provider.pullRequests);
    loadCurrentView();
    startPolling();
  }

  // Start auth health polling
  authHealthPolling.startPolling();
});

async function validateTokenPermissions(): Promise<void> {
  isValidatingToken.value = true;

  try {
    const token = getApiKey();
    if (!token) {
      tokenValidationComplete.value = true;
      return;
    }

    const result = await validateToken(
      configStore.providerType,
      token,
      configStore.gitlabUrl || undefined
    );

    // Handle completely invalid token (401 error, wrong provider, etc.)
    if (!result.valid && result.error) {
      console.error('[Auth] Token validation failed:', result.error);

      // Show notification to user
      showNotification({
        title: 'Authentication Error',
        body: `Your ${configStore.providerType === 'github' ? 'GitHub' : 'GitLab'} token is invalid. Please update it in Settings.`,
      });

      // Clear the invalid token and redirect to settings
      await authStore.logout();
      tokenValidationComplete.value = true;
      return;
    }

    missingScopes.value = result.missingScopes;
    currentScopes.value = result.scopes;
    tokenValidationComplete.value = true;
  } catch (error) {
    console.error('Token validation error:', error);

    // Show notification for unexpected errors
    showNotification({
      title: 'Authentication Error',
      body: 'Failed to validate your token. Please check your settings.',
    });

    tokenValidationComplete.value = true;
  } finally {
    isValidatingToken.value = false;
  }
}

function handleTokenValidated(): void {
  missingScopes.value = [];
  initializeFollowUpService(provider.pullRequests);
  loadCurrentView();
  startPolling();
}

function handleChangeTokenFromScopes(): void {
  missingScopes.value = [];
  currentScopes.value = [];
  tokenValidationComplete.value = false;
  showSettings.value = true;
}

watch(
  () => viewStore.activeViewId,
  (newViewId) => {
    // Skip loading for special views that don't use the standard view data
    if (isNotificationsView(newViewId) || isPinnedView(newViewId)) {
      return;
    }

    const isNewView = !isViewVisited(newViewId);
    const hasNoData = currentViewState.value.prs.value.length === 0 && !currentViewState.value.lastFetched.value;

    if (isNewView || hasNoData) {
      markViewAsVisited(newViewId);
      loadCurrentView();
    }
  }
);

watch(
  () => ({
    prs: currentViewState.value.prs.value,
    isNotifications: isNotificationsViewActive.value,
    unread: unreadCount.value,
  }),
  ({ prs, isNotifications, unread }) => {
    updatePrCount(isNotifications ? unread : prs.length);
  },
  { immediate: true }
);

function handleLogout() {
  showSettings.value = false;
  authHealthPolling.stopPolling();
  clearAllViewStates();
}

function handleProviderChanged() {
  showSettings.value = false;
  clearAllViewStates();
}

function handleGlobalError(error: Error, info: string) {
  console.error('Global error caught:', error, info);
}

async function handleManualRefresh() {
  // refreshActiveView polls followed PRs and updates notifications
  // loadCurrentView handles the view-specific loading UI
  await Promise.all([
    refreshActiveView(),
    loadCurrentView(),
  ]);
  restartPolling();
}

async function loadCurrentView() {
  const view = activeView.value;

  if (isNotificationsView(view.id)) {
    return;
  }

  // For pinned view, signal refresh needed by clearing lastFetched
  // PinnedPRsView watches this and triggers its own data fetch
  if (isPinnedView(view.id)) {
    currentViewState.value.lastFetched.value = null;
    return;
  }

  const state = currentViewState.value;

  state.loading.value = true;
  state.error.value = '';
  setSyncing(true);

  try {
    const result = await viewAdapter.getViewData(
      view,
      configStore.username || undefined
    );

    state.prs.value = result.prs;
    state.pageInfo.value = result.pageInfo;
    state.lastFetched.value = new Date();

    // NOTE: Notifications are handled exclusively by FollowUpService for followed PRs.
    // View refreshes should NOT trigger notifications.
  } catch (e) {
    state.error.value = e instanceof Error ? e.message : 'Failed to load PRs';
    console.error('Error loading view:', e);
  } finally {
    state.loading.value = false;
    setSyncing(false);
  }
}

async function loadMore() {
  const view = activeView.value;
  const state = currentViewState.value;

  if (!state.pageInfo.value.hasNextPage) return;

  state.loading.value = true;

  try {
    const result = await viewAdapter.getViewData(
      view,
      configStore.username || undefined,
      20,
      state.pageInfo.value.endCursor || undefined
    );

    state.prs.value = [...state.prs.value, ...result.prs];
    state.pageInfo.value = result.pageInfo;
  } catch (e) {
    state.error.value = e instanceof Error ? e.message : 'Failed to load more PRs';
  } finally {
    state.loading.value = false;
  }
}

const inFlightComments = new Map<string, Promise<void>>();
const inFlightChecks = new Map<string, Promise<void>>();

async function handleToggleExpand(pr: PullRequestBasic) {
  const commit = pr.commits?.nodes?.[0]?.commit;
  if (!commit || !commit.statusCheckRollup) return;
  if (commit.statusCheckRollup.contexts?.nodes?.length) return;

  const [owner, repo] = pr.repository.nameWithOwner.split('/');
  const key = `${owner}/${repo}/${pr.number}`;

  if (inFlightChecks.has(key)) {
    await inFlightChecks.get(key);
    return;
  }

  const promise = (async () => {
    try {
      const checks = await provider.checks.getChecks(owner, repo, pr.number);
      if (checks && checks.contexts) {
        commit.statusCheckRollup.contexts = checks.contexts;
      }
    } catch (e) {
      console.error('Error fetching checks:', e);
    } finally {
      inFlightChecks.delete(key);
    }
  })();

  inFlightChecks.set(key, promise);
  await promise;
}

async function handleToggleExpandComments(pr: PullRequestBasic) {
  if (!pr.comments) return;
  if (pr.comments.nodes?.length) return;

  const [owner, repo] = pr.repository.nameWithOwner.split('/');
  const key = `${owner}/${repo}/${pr.number}`;

  if (inFlightComments.has(key)) {
    await inFlightComments.get(key);
    return;
  }

  const promise = (async () => {
    try {
      const comments = await provider.comments.getComments(owner, repo, pr.number);
      if (comments) {
        pr.comments.nodes = comments;
      }
    } catch (e) {
      console.error('Error fetching comments:', e);
    } finally {
      inFlightComments.delete(key);
    }
  })();

  inFlightComments.set(key, promise);
  await promise;
}

let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
const PREFETCH_DELAY = 200;

function handlePrefetch(pr: PullRequestBasic) {
  if (!configStore.prefetchOnHover) return;

  if (prefetchTimer) {
    clearTimeout(prefetchTimer);
  }

  prefetchTimer = setTimeout(async () => {
    const [owner, repo] = pr.repository.nameWithOwner.split('/');
    const key = `${owner}/${repo}/${pr.number}`;

    if (pr.comments?.totalCount && !pr.comments.nodes?.length && !inFlightComments.has(key)) {
      const promise = provider.comments.getComments(owner, repo, pr.number)
        .then(comments => {
          if (comments && pr.comments) {
            pr.comments.nodes = comments;
          }
        })
        .catch(console.error)
        .finally(() => inFlightComments.delete(key));

      inFlightComments.set(key, promise);
    }

    const commit = pr.commits?.nodes?.[0]?.commit;
    if (commit?.statusCheckRollup && !commit.statusCheckRollup.contexts?.nodes?.length && !inFlightChecks.has(key)) {
      const promise = provider.checks.getChecks(owner, repo, pr.number)
        .then(checks => {
          if (checks?.contexts && commit.statusCheckRollup) {
            commit.statusCheckRollup.contexts = checks.contexts;
          }
        })
        .catch(console.error)
        .finally(() => inFlightChecks.delete(key));

      inFlightChecks.set(key, promise);
    }
  }, PREFETCH_DELAY);
}

function handlePrefetchCancel() {
  if (prefetchTimer) {
    clearTimeout(prefetchTimer);
    prefetchTimer = null;
  }
}

function selectPR(pr: PullRequestBasic) {
  console.log('Selected PR:', pr);
}

function handleSaveView(view: ViewConfig) {
  try {
    addCustomView(view);
    showViewEditor.value = false;
  } catch (e) {
    console.error('Error creating view:', e);
  }
}
</script>

<style>
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  user-select: none;
}

* {
  box-sizing: border-box;
}
</style>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--color-bg-primary);
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 16px;
  color: var(--color-text-secondary);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-container p {
  margin: 0;
  font-size: 14px;
}

.content-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.2px;
  margin: 0;
  color: var(--color-text-primary);
}

.titlebar-btn {
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  width: 32px;
  height: 32px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.titlebar-btn:hover:not(:disabled) {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.titlebar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.titlebar-btn.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.polling-indicator {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-success-bg);
  border-radius: var(--radius-xl);
  font-size: 10px;
  font-weight: 500;
  color: var(--color-success);
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background: var(--color-success);
  border-radius: var(--radius-full);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

.countdown {
  font-variant-numeric: tabular-nums;
}

.header {
  padding: 0 var(--spacing-lg);
  margin-bottom: var(--spacing-md);
  flex-shrink: 0;
}

.header-content {
  display: flex;
  flex-direction: column;
}

.error-banner {
  background: var(--color-error-bg);
  color: var(--color-error);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  margin: 0 var(--spacing-lg) var(--spacing-md);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 var(--spacing-lg) var(--spacing-lg);
  animation: fadeIn 0.3s ease;
  min-height: 0;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
