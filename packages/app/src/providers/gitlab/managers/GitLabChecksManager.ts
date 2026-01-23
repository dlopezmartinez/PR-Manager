/**
 * GitLabChecksManager - Manages CI/CD pipeline operations for GitLab
 * Implements IChecksManager interface
 *
 * In GitLab, CI/CD status comes from Pipelines instead of Checks
 */

import type { StatusCheckRollup, CheckRun, StatusContext, CheckContext } from '../../../model/types';
import type { IChecksManager, ChecksSummary } from '../../interfaces';
import { CacheableManager } from '../../base/CacheableManager';
import { GitLabService } from '../GitLabService';
import { MR_PIPELINE_QUERY } from '../queries/mergeRequests';
import type { GitLabPipelineResponse } from '../adapters/GitLabResponseAdapter';
import { GitLabResponseAdapter } from '../adapters/GitLabResponseAdapter';

export class GitLabChecksManager
  extends CacheableManager<StatusCheckRollup | null>
  implements IChecksManager
{
  private gitlabService: GitLabService;

  constructor(gitlabService: GitLabService) {
    super('GitLabChecksManager');
    this.gitlabService = gitlabService;
  }

  /**
   * Get CI/CD pipeline status for a specific merge request
   */
  async getChecks(
    owner: string,
    repo: string,
    prNumber: number,
    useCache = true
  ): Promise<StatusCheckRollup | null> {
    const projectPath = `${owner}/${repo}`;
    const cacheKey = `${projectPath}/${prNumber}`;

    return this.getOrFetch(
      cacheKey,
      async () => {
        const result = await this.gitlabService.executeQuery<GitLabPipelineResponse>(
          MR_PIPELINE_QUERY,
          { projectPath, iid: String(prNumber) }
        );

        const pipeline = result.data.project.mergeRequest.headPipeline;
        return GitLabResponseAdapter.transformPipeline(pipeline);
      },
      useCache
    );
  }

  /**
   * Get a detailed summary of checks (pipeline jobs)
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
            if (checkRun.status === 'IN_PROGRESS' || checkRun.status === 'QUEUED' ||
                checkRun.status === 'PENDING' || checkRun.status === 'RUNNING') {
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
   * Check if all CI/CD checks (pipeline) are passing
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
