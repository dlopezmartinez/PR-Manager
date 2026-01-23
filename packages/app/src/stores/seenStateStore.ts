import { reactive, computed, watch } from 'vue';
import type { PullRequestBasic } from '../model/types';
import type { ViewId } from '../model/view-types';

export interface SeenPRInfo {
  prId: string;
  seenAt: string;
  seenInView?: ViewId;
}

interface SeenStateStoreData {
  seenPRs: Record<string, SeenPRInfo>;
  lastPruned: string;
}

const STORAGE_KEY = 'pr-manager-seen-prs';
const MAX_ENTRIES = 1000;
const PRUNE_AGE_DAYS = 30;
const SAVE_DEBOUNCE_MS = 1000;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function loadSeenState(): SeenStateStoreData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return {
        seenPRs: data.seenPRs || {},
        lastPruned: data.lastPruned || new Date().toISOString(),
      };
    }
  } catch (e) {
    console.error('Error loading seen state:', e);
  }
  return {
    seenPRs: {},
    lastPruned: new Date().toISOString(),
  };
}

function saveSeenState(data: SeenStateStoreData): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Error saving seen state:', e);
    }
  }, SAVE_DEBOUNCE_MS);
}

function pruneOldEntries(data: SeenStateStoreData): void {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - PRUNE_AGE_DAYS * 24 * 60 * 60 * 1000);
  const entries = Object.entries(data.seenPRs);

  let pruned = 0;
  for (const [prId, info] of entries) {
    const seenDate = new Date(info.seenAt);
    if (seenDate < cutoffDate) {
      delete data.seenPRs[prId];
      pruned++;
    }
  }

  const remaining = Object.entries(data.seenPRs);
  if (remaining.length > MAX_ENTRIES) {
    const sorted = remaining.sort((a, b) =>
      new Date(a[1].seenAt).getTime() - new Date(b[1].seenAt).getTime()
    );
    const toRemove = sorted.slice(0, remaining.length - MAX_ENTRIES);
    for (const [prId] of toRemove) {
      delete data.seenPRs[prId];
      pruned++;
    }
  }

  if (pruned > 0) {
    console.log(`SeenStateStore: Pruned ${pruned} old entries`);
  }

  data.lastPruned = now.toISOString();
}

const storeData = reactive<SeenStateStoreData>(loadSeenState());

const lastPruned = new Date(storeData.lastPruned);
const now = new Date();
if (now.getTime() - lastPruned.getTime() > 24 * 60 * 60 * 1000) {
  pruneOldEntries(storeData);
  saveSeenState(storeData);
}

watch(
  () => ({ ...storeData }),
  (newData) => {
    saveSeenState(newData);
  },
  { deep: true }
);

export function markAsSeen(prId: string, viewId?: ViewId): void {
  storeData.seenPRs[prId] = {
    prId,
    seenAt: new Date().toISOString(),
    seenInView: viewId,
  };
}

export function markAsUnseen(prId: string): void {
  delete storeData.seenPRs[prId];
}

export function isSeen(prId: string): boolean {
  return prId in storeData.seenPRs;
}

export function getSeenInfo(prId: string): SeenPRInfo | undefined {
  return storeData.seenPRs[prId];
}

export function markAllAsSeen(prs: PullRequestBasic[], viewId?: ViewId): void {
  const now = new Date().toISOString();
  for (const pr of prs) {
    storeData.seenPRs[pr.id] = {
      prId: pr.id,
      seenAt: now,
      seenInView: viewId,
    };
  }
}

export function getUnseenCount(prs: PullRequestBasic[]): number {
  return prs.filter(pr => !isSeen(pr.id)).length;
}

export function getUnseenPRs(prs: PullRequestBasic[]): PullRequestBasic[] {
  return prs.filter(pr => !isSeen(pr.id));
}

export function clearAllSeen(): void {
  storeData.seenPRs = {};
  storeData.lastPruned = new Date().toISOString();
}

export function getSeenCount(): number {
  return Object.keys(storeData.seenPRs).length;
}

export function useUnseenCount(prs: () => PullRequestBasic[]) {
  return computed(() => getUnseenCount(prs()));
}

export const seenStateStore = storeData;
