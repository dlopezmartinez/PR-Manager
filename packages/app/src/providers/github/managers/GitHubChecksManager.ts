/**
 * GitHubChecksManager - Manages CI/CD check operations for GitHub
 * Implements IChecksManager interface
 */

import type { StatusCheckRollup, CheckRun, StatusContext, CheckContext } from '../../../model/types';
import type { IChecksManager, ChecksSummary } from '../../interfaces';
import { CacheableManager } from '../../base/CacheableManager';
import { GitHubService } from '../GitHubService';
import { PR_CHECKS_BY_ID_QUERY } from '../queries/pullRequests';
import type { GitHubChecksResponse } from '../adapters/GitHubResponseAdapter';
import { GitHubResponseAdapter } from '../adapters/GitHubResponseAdapter';

export class GitHubChecksManager
  extends CacheableManager<StatusCheckRollup | null>
  implements IChecksManager
{
  private githubService: GitHubService;

  constructor(githubService: GitHubService) {
    super('GitHubChecksManager');
    this.githubService = githubService;
  }

  /**
   * Get CI/CD check status for a specific pull request
   */
  async getChecks(
    owner: string,
    repo: string,
    prNumber: number,
    useCache = true
  ): Promise<StatusCheckRollup | null> {
    const cacheKey = `${owner}/${repo}/${prNumber}`;

    return this.getOrFetch(
      cacheKey,
      async () => {
        const result = await this.githubService.executeQuery<GitHubChecksResponse>(
          PR_CHECKS_BY_ID_QUERY,
          { owner, repo, number: prNumber }
        );
        return GitHubResponseAdapter.transformChecks(result);
      },
      useCache
    );
  }

  /**
   * Get a detailed summary of checks
   */
  getChecksSummary(rollup: StatusCheckRollup | null): ChecksSummary {
    if (!rollup) {
      return {
        state: 'UNKNOWN',
        total: 0,
        success: 0,
        failure: 0,
        pending: 0,
        neutral: 0,
        failedChecks: [],
        pendingChecks: [],
      };
    }

    const summary: ChecksSummary = {
      state: rollup.state,
      total: rollup.contexts.totalCount,
      success: 0,
      failure: 0,
      pending: 0,
      neutral: 0,
      failedChecks: [],
      pendingChecks: [],
    };

    rollup.contexts.nodes.forEach((check: CheckContext) => {
      if (check.__typename === 'CheckRun') {
        const checkRun = check as CheckRun;
        switch (checkRun.conclusion) {
          case 'SUCCESS':
            summary.success++;
            break;
          case 'FAILURE':
          case 'TIMED_OUT':
            summary.failure++;
            summary.failedChecks.push(check);
            break;
          case 'NEUTRAL':
          case 'SKIPPED':
            summary.neutral++;
            break;
          case null:
            if (checkRun.status === 'IN_PROGRESS' || checkRun.status === 'QUEUED') {
              summary.pending++;
              summary.pendingChecks.push(check);
            }
            break;
        }
      } else if (check.__typename === 'StatusContext') {
        const statusContext = check as StatusContext;
        switch (statusContext.state) {
          case 'SUCCESS':
            summary.success++;
            break;
          case 'FAILURE':
          case 'ERROR':
            summary.failure++;
            summary.failedChecks.push(check);
            break;
          case 'PENDING':
            summary.pending++;
            summary.pendingChecks.push(check);
            break;
        }
      }
    });

    return summary;
  }

  /**
   * Check if all CI/CD checks are passing
   */
  areChecksPassing(rollup: StatusCheckRollup | null): boolean {
    if (!rollup) return false;
    return rollup.state === 'SUCCESS';
  }

  /**
   * Clear the checks cache
   */
  clearChecksCache(owner?: string, repo?: string, prNumber?: number): void {
    if (owner && repo && prNumber) {
      this.invalidate(`${owner}/${repo}/${prNumber}`);
    } else {
      this.clearCache();
    }
  }
}
