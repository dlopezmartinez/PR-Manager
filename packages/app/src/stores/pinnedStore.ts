import { reactive, computed, watch } from 'vue';
import type { PullRequestBasic } from '../model/types';

export interface PinnedPRInfo {
  prId: string;
  prNumber: number;
  repoNameWithOwner: string;
  url: string;
  title: string;
  authorLogin: string;
  authorAvatarUrl: string;
  pinnedAt: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  isDraft: boolean;
}

interface PinnedStoreData {
  pinnedPRs: Record<string, PinnedPRInfo>;
}

const STORAGE_KEY = 'pr-manager-pinned';
const MAX_PINNED_PRS = 50;
const SAVE_DEBOUNCE_MS = 500;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function loadPinnedState(): PinnedStoreData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return {
        pinnedPRs: data.pinnedPRs || {},
      };
    }
  } catch (e) {
    console.error('Error loading pinned state:', e);
  }
  return {
    pinnedPRs: {},
  };
}

function savePinnedState(data: PinnedStoreData): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Error saving pinned state:', e);
    }
  }, SAVE_DEBOUNCE_MS);
}

const storeData = reactive<PinnedStoreData>(loadPinnedState());

watch(
  () => ({ ...storeData }),
  (newData) => {
    savePinnedState(newData);
  },
  { deep: true }
);

export function pinPR(pr: PullRequestBasic): boolean {
  if (Object.keys(storeData.pinnedPRs).length >= MAX_PINNED_PRS) {
    console.warn(`Cannot pin more than ${MAX_PINNED_PRS} PRs`);
    return false;
  }

  if (storeData.pinnedPRs[pr.id]) {
    return false;
  }

  storeData.pinnedPRs[pr.id] = {
    prId: pr.id,
    prNumber: pr.number,
    repoNameWithOwner: pr.repository.nameWithOwner,
    url: pr.url,
    title: pr.title,
    authorLogin: pr.author.login,
    authorAvatarUrl: pr.author.avatarUrl,
    pinnedAt: new Date().toISOString(),
    state: pr.state as 'OPEN' | 'MERGED' | 'CLOSED',
    isDraft: pr.isDraft,
  };

  return true;
}

export function unpinPR(prId: string): void {
  delete storeData.pinnedPRs[prId];
}

export function isPinned(prId: string): boolean {
  return prId in storeData.pinnedPRs;
}

export function getPinnedPRInfo(prId: string): PinnedPRInfo | undefined {
  return storeData.pinnedPRs[prId];
}

export function getPinnedPRs(): PinnedPRInfo[] {
  return Object.values(storeData.pinnedPRs);
}

export function getPinnedPRIds(): string[] {
  return Object.keys(storeData.pinnedPRs);
}

export function updatePinnedPRState(prId: string, pr: PullRequestBasic): void {
  const info = storeData.pinnedPRs[prId];
  if (info) {
    info.title = pr.title;
    info.state = pr.state as 'OPEN' | 'MERGED' | 'CLOSED';
    info.isDraft = pr.isDraft;
  }
}

export function unpinAll(): void {
  storeData.pinnedPRs = {};
}

export function canPinMore(): boolean {
  return Object.keys(storeData.pinnedPRs).length < MAX_PINNED_PRS;
}

export const pinnedCount = computed(() => Object.keys(storeData.pinnedPRs).length);

export const pinnedPRsList = computed(() => Object.values(storeData.pinnedPRs));

export const pinnedStore = storeData;
