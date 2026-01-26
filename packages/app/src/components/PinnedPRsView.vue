<template>
  <div class="pinned-prs-view">
    <div v-if="pinnedPRs.length === 0" class="empty-state">
      <Pin :size="48" :stroke-width="1.5" class="empty-icon" />
      <h3>No pinned PRs</h3>
      <p>Pin PRs from the card menu for quick access</p>
    </div>

    <template v-else>
      <div class="pinned-header">
        <span class="pinned-count">{{ pinnedPRs.length }} pinned PR{{ pinnedPRs.length !== 1 ? 's' : '' }}</span>
        <button class="unpin-all-btn" @click="handleUnpinAll">
          <PinOff :size="14" :stroke-width="2" />
          Unpin all
        </button>
      </div>

      <div v-if="viewState.loading.value" class="loading-state">
        <span class="loading-spinner"></span>
        <span>Loading pinned PRs...</span>
      </div>

      <div v-else class="pinned-list">
        <PullRequestCard
          v-for="pr in viewState.prs.value"
          :key="pr.id"
          :pr="pr"
          @toggle-expand="handleToggleExpand"
          @toggle-expand-comments="handleToggleExpandComments"
        />
        <!-- Fallback for PRs that failed to load - show minimal card -->
        <div
          v-for="failedPr in failedToLoadPRs"
          :key="failedPr.prId"
          class="pinned-card-fallback"
          @click="openPR(failedPr)"
        >
          <div class="fallback-header">
            <span class="fallback-title">{{ failedPr.title }}</span>
            <span class="fallback-number">#{{ failedPr.prNumber }}</span>
          </div>
          <div class="fallback-meta">
            <span class="fallback-repo">{{ failedPr.repoNameWithOwner }}</span>
            <span class="fallback-error">Failed to load - click to open in browser</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { Pin, PinOff } from 'lucide-vue-next';
import { getPinnedPRs, unpinAll, type PinnedPRInfo, pinnedCount } from '../stores/pinnedStore';
import { openExternal } from '../utils/electron';
import { useGitProvider } from '../composables/useGitProvider';
import { useViewState } from '../composables/useViewState';
import { VIEW_PINNED_ID } from '../config/default-views';
import PullRequestCard from './PullRequestCard.vue';
import type { PullRequestBasic } from '../model/types';

const pinnedPRs = computed(() => getPinnedPRs());
const failedPrIds = ref<Set<string>>(new Set());

const failedToLoadPRs = computed(() => {
  return pinnedPRs.value.filter(pr => failedPrIds.value.has(pr.prId));
});

const provider = useGitProvider();
const viewState = useViewState(VIEW_PINNED_ID);

async function fetchPinnedPRsData() {
  if (pinnedPRs.value.length === 0) {
    viewState.prs.value = [];
    viewState.lastFetched.value = new Date();
    return;
  }

  viewState.loading.value = true;
  failedPrIds.value = new Set();
  const results: PullRequestBasic[] = [];

  try {
    for (const pinnedInfo of pinnedPRs.value) {
      try {
        const [owner, repo] = pinnedInfo.repoNameWithOwner.split('/');
        const pr = await provider.pullRequests.getPullRequestDetails(
          owner,
          repo,
          pinnedInfo.prNumber,
          false
        );
        results.push(pr as PullRequestBasic);
      } catch (error) {
        console.error(`Failed to fetch pinned PR ${pinnedInfo.prNumber}:`, error);
        failedPrIds.value.add(pinnedInfo.prId);
      }
    }
    viewState.prs.value = results;
    viewState.lastFetched.value = new Date();
  } finally {
    viewState.loading.value = false;
  }
}

function openPR(pr: PinnedPRInfo) {
  openExternal(pr.url).catch(console.error);
}

function handleUnpinAll() {
  unpinAll();
  viewState.prs.value = [];
  viewState.lastFetched.value = null;
}

// Track in-flight requests to avoid duplicates
const inFlightChecks = new Map<string, Promise<void>>();
const inFlightComments = new Map<string, Promise<void>>();

// Handle expanding PR to load checks
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
    } catch (error) {
      console.error('Failed to load PR checks:', error);
    } finally {
      inFlightChecks.delete(key);
    }
  })();

  inFlightChecks.set(key, promise);
  await promise;
}

// Handle expanding PR to load comments
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
      if (comments && pr.comments) {
        pr.comments.nodes = comments;
      }
    } catch (error) {
      console.error('Failed to load PR comments:', error);
    } finally {
      inFlightComments.delete(key);
    }
  })();

  inFlightComments.set(key, promise);
  await promise;
}

// Watch for pinned PRs count changes to refetch
watch(pinnedCount, (newCount, oldCount) => {
  // Only refetch if count changed (PR added or removed)
  if (newCount !== oldCount) {
    fetchPinnedPRsData();
  }
}, { immediate: false });

// Watch for manual refresh trigger (App.vue sets lastFetched to null)
watch(() => viewState.lastFetched.value, (newVal) => {
  if (newVal === null && pinnedPRs.value.length > 0) {
    fetchPinnedPRsData();
  }
});

// Initial fetch only if we don't have cached data
onMounted(() => {
  // Only fetch if we haven't fetched before or if the pinned list might have changed
  const hasCachedData = viewState.lastFetched.value !== null;
  const cachedCount = viewState.prs.value.length;
  const currentPinnedCount = pinnedPRs.value.length;

  // Fetch if:
  // - No cached data at all
  // - Cached count doesn't match current pinned count (PRs were added/removed while away)
  if (!hasCachedData || cachedCount !== currentPinnedCount) {
    fetchPinnedPRsData();
  }
});
</script>

<style scoped>
.pinned-prs-view {
  padding: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--color-text-tertiary);
}

.empty-icon {
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state h3 {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}

.pinned-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--color-border-tertiary);
}

.pinned-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.unpin-all-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.unpin-all-btn:hover {
  background: var(--color-error-bg);
  border-color: var(--color-error);
  color: var(--color-error);
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border-secondary);
  border-top-color: var(--color-accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.pinned-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Fallback card for PRs that failed to load */
.pinned-card-fallback {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-lg);
  padding: 16px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.pinned-card-fallback:hover {
  border-color: var(--color-border-primary);
}

.fallback-header {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
}

.fallback-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.fallback-number {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.fallback-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
}

.fallback-repo {
  color: var(--color-text-tertiary);
  font-weight: 500;
}

.fallback-error {
  color: var(--color-warning);
}
</style>
