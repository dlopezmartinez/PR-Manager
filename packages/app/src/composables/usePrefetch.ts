import { ref } from 'vue';
import { configStore } from '../stores/configStore';

const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  timestamp: number;
}

interface PrefetchCache {
  entries: Map<string, CacheEntry>;
}

const prefetchedState = {
  comments: { entries: new Map<string, CacheEntry>() } as PrefetchCache,
  checks: { entries: new Map<string, CacheEntry>() } as PrefetchCache,
};

function isValidEntry(entry: CacheEntry | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

function addToCache(cache: PrefetchCache, prId: string): void {
  if (cache.entries.size >= MAX_CACHE_SIZE) {
    const entriesToRemove = Math.ceil(MAX_CACHE_SIZE * 0.2);
    const sortedEntries = [...cache.entries.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    for (let i = 0; i < entriesToRemove && i < sortedEntries.length; i++) {
      cache.entries.delete(sortedEntries[i][0]);
    }
  }

  cache.entries.set(prId, { timestamp: Date.now() });
}

function hasCached(cache: PrefetchCache, prId: string): boolean {
  const entry = cache.entries.get(prId);
  if (!isValidEntry(entry)) {
    if (entry) cache.entries.delete(prId);
    return false;
  }
  return true;
}

let hoverTimer: ReturnType<typeof setTimeout> | null = null;
const HOVER_DELAY = 150;

export interface UsePrefetchOptions {
  onPrefetchComments: (prId: string) => Promise<void>;
  onPrefetchChecks: (prId: string) => Promise<void>;
}

export function usePrefetch(options: UsePrefetchOptions) {
  const { onPrefetchComments, onPrefetchChecks } = options;
  const isPrefetching = ref(false);

  function isEnabled(): boolean {
    return configStore.prefetchOnHover;
  }

  function handleMouseEnter(prId: string, hasComments: boolean, hasChecks: boolean) {
    if (!isEnabled()) return;

    if (hoverTimer) {
      clearTimeout(hoverTimer);
    }

    hoverTimer = setTimeout(async () => {
      isPrefetching.value = true;
      const promises: Promise<void>[] = [];

      if (hasComments && !hasCached(prefetchedState.comments, prId)) {
        promises.push(
          onPrefetchComments(prId).then(() => {
            addToCache(prefetchedState.comments, prId);
          }).catch(console.error)
        );
      }

      if (hasChecks && !hasCached(prefetchedState.checks, prId)) {
        promises.push(
          onPrefetchChecks(prId).then(() => {
            addToCache(prefetchedState.checks, prId);
          }).catch(console.error)
        );
      }

      await Promise.all(promises);
      isPrefetching.value = false;
    }, HOVER_DELAY);
  }

  function handleMouseLeave() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  }

  function clearPrefetchCache() {
    prefetchedState.comments.entries.clear();
    prefetchedState.checks.entries.clear();
  }

  function isPrefetched(prId: string, type: 'comments' | 'checks'): boolean {
    const cache = type === 'comments' ? prefetchedState.comments : prefetchedState.checks;
    return hasCached(cache, prId);
  }

  return {
    isPrefetching,
    handleMouseEnter,
    handleMouseLeave,
    clearPrefetchCache,
    isPrefetched,
  };
}
