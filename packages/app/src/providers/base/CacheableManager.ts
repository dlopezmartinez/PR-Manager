import { githubLogger } from '../../utils/logger';
import { PR_CACHE_TTL_MS } from '../../utils/constants';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

const MAX_CACHE_SIZE = 200;

export abstract class CacheableManager<T> {
  protected cache: Map<string, CacheEntry<T>> = new Map();
  protected readonly managerName: string;
  protected readonly ttlMs: number;

  constructor(managerName: string, ttlMs: number = PR_CACHE_TTL_MS) {
    this.managerName = managerName;
    this.ttlMs = ttlMs;
  }

  private isValidEntry(entry: CacheEntry<T> | undefined): boolean {
    if (!entry) return false;
    return Date.now() - entry.timestamp < this.ttlMs;
  }

  private enforceMaxSize(): void {
    if (this.cache.size < MAX_CACHE_SIZE) return;

    const entriesToRemove = Math.ceil(MAX_CACHE_SIZE * 0.2);
    const sortedEntries = [...this.cache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    for (let i = 0; i < entriesToRemove && i < sortedEntries.length; i++) {
      this.cache.delete(sortedEntries[i][0]);
    }

    githubLogger.debug(`${this.managerName}: Evicted ${entriesToRemove} old entries`);
  }

  protected getCached(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!this.isValidEntry(entry)) {
      if (entry) this.cache.delete(key);
      return undefined;
    }
    return entry!.value;
  }

  protected hasCached(key: string): boolean {
    const entry = this.cache.get(key);
    if (!this.isValidEntry(entry)) {
      if (entry) this.cache.delete(key);
      return false;
    }
    return true;
  }

  protected setCache(key: string, value: T): void {
    this.enforceMaxSize();
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  protected async getOrFetch(
    key: string,
    fetcher: () => Promise<T>,
    useCache = true
  ): Promise<T> {
    if (useCache && this.hasCached(key)) {
      githubLogger.debug(`${this.managerName}: Cache hit for ${key}`);
      return this.getCached(key)!;
    }

    githubLogger.debug(`${this.managerName}: Fetching ${key}`);
    const result = await fetcher();
    this.setCache(key, result);

    return result;
  }

  clearCache(): void {
    githubLogger.debug(`${this.managerName}: Clearing cache (${this.cache.size} entries)`);
    this.cache.clear();
  }

  invalidate(key: string): void {
    githubLogger.debug(`${this.managerName}: Invalidating cache for ${key}`);
    this.cache.delete(key);
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  cleanExpired(): number {
    let removed = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.ttlMs) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      githubLogger.debug(`${this.managerName}: Cleaned ${removed} expired entries`);
    }

    return removed;
  }
}
