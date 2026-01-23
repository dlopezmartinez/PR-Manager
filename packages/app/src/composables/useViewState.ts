import { ref, type Ref } from 'vue';
import type { ViewId, ViewState } from '../model/view-types';
import type { PullRequestBasic, PageInfo } from '../model/types';

interface ReactiveViewState {
  prs: Ref<PullRequestBasic[]>;
  pageInfo: Ref<PageInfo>;
  loading: Ref<boolean>;
  error: Ref<string>;
  lastFetched: Ref<Date | null>;
}

const viewStatesCache = new Map<ViewId, ReactiveViewState>();

function createDefaultReactiveState(): ReactiveViewState {
  return {
    prs: ref<PullRequestBasic[]>([]),
    pageInfo: ref<PageInfo>({ hasNextPage: false, endCursor: null }),
    loading: ref<boolean>(false),
    error: ref<string>(''),
    lastFetched: ref<Date | null>(null),
  };
}

/**
 * Composable for managing individual view state.
 * State refs are shared across all consumers of the same viewId,
 * so when polling updates the PRs, the UI automatically sees the changes.
 */
export function useViewState(viewId: ViewId): ReactiveViewState {
  if (!viewStatesCache.has(viewId)) {
    viewStatesCache.set(viewId, createDefaultReactiveState());
  }

  return viewStatesCache.get(viewId)!;
}

export function getAllViewStates(): Map<ViewId, ReactiveViewState> {
  return viewStatesCache;
}

export function getViewStateSnapshot(viewId: ViewId): ViewState | undefined {
  const state = viewStatesCache.get(viewId);
  if (!state) return undefined;

  return {
    prs: state.prs.value,
    pageInfo: state.pageInfo.value,
    loading: state.loading.value,
    error: state.error.value,
    lastFetched: state.lastFetched.value,
  };
}

export function clearViewState(viewId: ViewId): void {
  viewStatesCache.delete(viewId);
}

export function clearAllViewStates(): void {
  viewStatesCache.clear();
}

export function hasViewState(viewId: ViewId): boolean {
  return viewStatesCache.has(viewId);
}

export function getViewPRCount(viewId: ViewId): number {
  const state = viewStatesCache.get(viewId);
  return state?.prs.value.length || 0;
}

export function getTotalPRCount(): number {
  let total = 0;
  for (const state of viewStatesCache.values()) {
    total += state.prs.value.length;
  }
  return total;
}

export function getUniquePRCount(): number {
  const uniquePRIds = new Set<string>();

  for (const state of viewStatesCache.values()) {
    for (const pr of state.prs.value) {
      uniquePRIds.add(pr.id);
    }
  }

  return uniquePRIds.size;
}

export function resetViewState(viewId: ViewId): void {
  const state = viewStatesCache.get(viewId);
  if (state) {
    state.prs.value = [];
    state.pageInfo.value = { hasNextPage: false, endCursor: null };
    state.loading.value = false;
    state.error.value = '';
    state.lastFetched.value = null;
  }
}
