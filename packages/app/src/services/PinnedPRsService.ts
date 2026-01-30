import type { PullRequestBasic } from '../model/types';
import type { IPullRequestManager } from '../providers/interfaces';
import {
  getPinnedPRs,
  updatePinnedPRState,
  type PinnedPRInfo,
} from '../stores/pinnedStore';
import { storeLogger } from '../utils/logger';

export interface PinnedPRsPollingResult {
  checked: number;
  updated: number;
  errors: string[];
}

/**
 * Service for polling pinned PRs.
 * Unlike FollowUpService, this does NOT generate notifications.
 * It only updates the stored state for display purposes.
 */
export class PinnedPRsService {
  private pullRequestManager: IPullRequestManager;
  private isPolling = false;

  constructor(pullRequestManager: IPullRequestManager) {
    this.pullRequestManager = pullRequestManager;
  }

  /**
   * Fetch and update state for all pinned PRs.
   * This does NOT generate notifications - pinned PRs are for quick access only.
   */
  async fetchPinnedPRs(): Promise<PinnedPRsPollingResult> {
    if (this.isPolling) {
      storeLogger.debug('PinnedPRsService: Already polling, skipping');
      return { checked: 0, updated: 0, errors: [] };
    }

    this.isPolling = true;
    const result: PinnedPRsPollingResult = {
      checked: 0,
      updated: 0,
      errors: [],
    };

    try {
      const pinnedPRs = getPinnedPRs();

      if (pinnedPRs.length === 0) {
        return result;
      }

      storeLogger.debug(`PinnedPRsService: Fetching ${pinnedPRs.length} pinned PRs`);

      const CONCURRENCY_LIMIT = 5;
      const chunks = this.chunkArray(pinnedPRs, CONCURRENCY_LIMIT);

      for (const chunk of chunks) {
        const promises = chunk.map((info) => this.fetchSinglePR(info, result));
        await Promise.all(promises);
      }

      storeLogger.debug(`PinnedPRsService: Fetch complete`, { checked: result.checked, updated: result.updated });
    } catch (error) {
      storeLogger.error('PinnedPRsService: Error during fetch', { error: (error as Error).message });
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.isPolling = false;
    }

    return result;
  }

  private async fetchSinglePR(
    info: PinnedPRInfo,
    result: PinnedPRsPollingResult
  ): Promise<void> {
    try {
      const { owner, repo } = this.parseRepository(info.repoNameWithOwner);

      const currentPR = await this.pullRequestManager.getPullRequestDetails(
        owner,
        repo,
        info.prNumber,
        false
      );

      result.checked++;

      // Update stored state (title, state, isDraft) without generating notifications
      updatePinnedPRState(info.prId, currentPR as PullRequestBasic);
      result.updated++;
    } catch (error) {
      storeLogger.error(`PinnedPRsService: Error fetching PR ${info.prNumber}`, { error: (error as Error).message });
      result.errors.push(
        `Failed to fetch ${info.repoNameWithOwner}#${info.prNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private parseRepository(nameWithOwner: string): { owner: string; repo: string } {
    const [owner, repo] = nameWithOwner.split('/');
    return { owner, repo };
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

let pinnedPRsServiceInstance: PinnedPRsService | null = null;

export function initializePinnedPRsService(manager: IPullRequestManager): PinnedPRsService {
  pinnedPRsServiceInstance = new PinnedPRsService(manager);
  return pinnedPRsServiceInstance;
}

export function getPinnedPRsService(): PinnedPRsService | null {
  return pinnedPRsServiceInstance;
}
